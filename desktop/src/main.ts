import { app, BrowserWindow, dialog, ipcMain, Menu, screen } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import started from 'electron-squirrel-startup';
import ffmpegPath from 'ffmpeg-static';

type StreamStartOptions = {
  serverUrl: string;
  streamKey: string;
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
  capture: { x: number; y: number; width: number; height: number };
};

type StreamSession = {
  child: ChildProcessWithoutNullStreams;
  window: BrowserWindow;
  active: boolean;
  stopping?: boolean;
  failed?: boolean;
};

type RecordingSession = {
  child: ChildProcessWithoutNullStreams;
  window: BrowserWindow;
  filePath: string;
  active: boolean;
  failed?: boolean;
};

let streamSession: StreamSession | null = null;
let recordingSession: RecordingSession | null = null;
const studioDisplayWindows = new Map<number, BrowserWindow>();

const optimizeImportedVideo = async (sourcePath: string) => {
  if (!ffmpegPath) return { ok: false as const, message: 'The video optimizer is unavailable on this computer.' };
  const sourceInfo = await stat(sourcePath);
  if (!sourceInfo.isFile()) return { ok: false as const, message: 'Choose a video file to optimize.' };
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'faithstream-media-'));
  const outputPath = path.join(tempDir, 'optimized.mp4');
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath!, [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath,
        '-map', '0:v:0', '-map', '0:a?',
        '-vf', "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outputPath,
      ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let errorText = '';
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { errorText += chunk; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Video optimization took too long.')) }, 30 * 60 * 1000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(errorText.trim() || 'Could not optimize this video.'));
      });
    });
    const outputInfo = await stat(outputPath);
    if (outputInfo.size >= sourceInfo.size) return { ok: true as const, optimized: false, originalBytes: sourceInfo.size, optimizedBytes: sourceInfo.size };
    const data = await readFile(outputPath);
    return { ok: true as const, optimized: true, originalBytes: sourceInfo.size, optimizedBytes: outputInfo.size, data: Uint8Array.from(data) };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

const exportPowerPointSlides = async (sourcePath: string) => {
  if (process.platform !== 'win32' || path.extname(sourcePath).toLowerCase() !== '.pptx') {
    throw new Error('PowerPoint slide rendering is only available for .pptx files on Windows.');
  }
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'faithstream-pptx-'));
  const sourceBase64 = Buffer.from(sourcePath, 'utf8').toString('base64');
  const outputBase64 = Buffer.from(tempDir, 'utf8').toString('base64');
  const script = `
$ErrorActionPreference = 'Stop'
$source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sourceBase64}'))
$outDir = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${outputBase64}'))
$app = $null
$presentation = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $presentation = $app.Presentations.Open($source, $true, $false, $false)
  $slides = @()
  for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
    $file = Join-Path $outDir ('slide-' + $i.ToString('D4') + '.png')
    $presentation.Slides.Item($i).Export($file, 'PNG', 1920, 1080)
    $slides += [PSCustomObject]@{ name = ('Slide ' + $i); data = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file)) }
  }
  ConvertTo-Json -InputObject @($slides) -Compress -Depth 4
} finally {
  if ($presentation -ne $null) { $presentation.Close() }
  if ($app -ne $null) { $app.Quit() }
}
`;
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
  try {
    const json = await new Promise<string>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript], { windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (part: string) => { stdout += part; });
      child.stderr.setEncoding('utf8').on('data', (part: string) => { stderr += part; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('PowerPoint took too long to open this file.')); }, 180_000);
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(stderr.trim() || 'PowerPoint could not render this file.'));
        else resolve(stdout.trim());
      });
    });
    const slides = JSON.parse(json) as { name: string; data: string }[];
    if (!Array.isArray(slides) || slides.length === 0) throw new Error('No slides were found in this PowerPoint file.');
    return slides;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

const ipcAudioBuffer = (payload: unknown) => {
  if (payload instanceof ArrayBuffer) return Buffer.from(payload);
  if (payload instanceof Uint8Array) return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  return null;
};

const sendStreamStatus = (window: BrowserWindow, status: string, message?: string) => {
  if (!window.isDestroyed()) window.webContents.send('stream:status', { status, message });
};

const stopStream = () => {
  const session = streamSession;
  if (!session) return false;
  streamSession = null;
  session.active = false;
  session.stopping = true;
  session.child.stdin.end();
  const audioPipe = session.child.stdio[3];
  if (audioPipe instanceof Writable) audioPipe.end();
  const killTimer = setTimeout(() => session.child.kill(), 5000);
  session.child.once('close', () => clearTimeout(killTimer));
  if (!session.failed) sendStreamStatus(session.window, 'stopping');
  return true;
};

const startRecording = async (window: BrowserWindow, capture: StreamStartOptions['capture']) => {
  if (recordingSession) return { ok: false, message: 'A recording is already running.' };
  if (!ffmpegPath) return { ok: false, message: 'The video encoder is unavailable on this computer.' };
  if (![capture.x, capture.y, capture.width, capture.height].every(Number.isFinite) || capture.width < 100 || capture.height < 50) {
    return { ok: false, message: 'The on-air preview is not ready to record.' };
  }
  const chosen = await dialog.showSaveDialog(window, {
    title: 'Save FaithStream recording',
    defaultPath: path.join(app.getPath('videos'), `FaithStream-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  if (chosen.canceled || !chosen.filePath) return { ok: false, canceled: true };

  const filePath = chosen.filePath.toLowerCase().endsWith('.mp4') ? chosen.filePath : `${chosen.filePath}.mp4`;
  const ffmpegArgs = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', '30', '-vcodec', 'png', '-i', 'pipe:0',
    '-f', 'webm', '-i', 'pipe:3',
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
    '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', filePath,
  ];
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(ffmpegPath, ffmpegArgs, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;
  } catch {
    return { ok: false, message: 'Could not start the video encoder.' };
  }

  const session: RecordingSession = { child, window, filePath, active: true };
  let encoderError = '';
  recordingSession = session;
  child.once('error', () => {
    session.failed = true;
    session.active = false;
    if (recordingSession === session) recordingSession = null;
    if (!window.isDestroyed()) window.webContents.send('recording:status', { status: 'error', message: 'The video encoder could not start.' });
  });
  child.once('close', (code) => {
    session.active = false;
    if (recordingSession === session) recordingSession = null;
    if (window.isDestroyed()) return;
    const detail = encoderError.trim().slice(-700);
    window.webContents.send('recording:status', !session.failed && code === 0
      ? { status: 'saved', filePath }
      : { status: 'error', message: detail ? `Recording could not be finalized: ${detail}` : 'The recording encoder stopped before it could finalize the MP4.' });
  });
  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    encoderError = (encoderError + text).slice(-2000);
    if (/error|failed|invalid/i.test(text)) session.failed = true;
  });

  void (async () => {
    const interval = 1000 / 30;
    while (session.active && recordingSession === session && !window.isDestroyed()) {
      const startedAt = Date.now();
      try {
        const frame = await window.webContents.capturePage(capture);
        if (!session.active || child.stdin.destroyed) break;
        if (!child.stdin.write(frame.toPNG())) await new Promise<void>((resolve) => child.stdin.once('drain', resolve));
      } catch {
        session.failed = true;
        session.active = false;
        child.kill();
        break;
      }
      await delay(Math.max(0, interval - (Date.now() - startedAt)));
    }
  })();
  return { ok: true, filePath };
};

const stopRecording = (window: BrowserWindow) => {
  const session = recordingSession;
  if (!session || session.window !== window) return false;
  session.active = false;
  session.child.stdin.end();
  const audioPipe = session.child.stdio[3];
  if (audioPipe instanceof Writable) audioPipe.end();
  return true;
};

const startStream = (window: BrowserWindow, options: StreamStartOptions) => {
  if (streamSession) return { ok: false, message: 'A stream is already running.' };
  if (!ffmpegPath) return { ok: false, message: 'The video encoder is unavailable on this computer.' };
  let endpoint: URL;
  try {
    endpoint = new URL(options.serverUrl);
  } catch {
    return { ok: false, message: 'Enter a valid Facebook server URL.' };
  }
  if (endpoint.protocol !== 'rtmps:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    return { ok: false, message: 'Use the secure RTMPS server URL supplied by Facebook Live Producer.' };
  }
  if (!options.streamKey.trim() || /[\r\n#]/.test(options.streamKey)) return { ok: false, message: 'Enter a valid Facebook stream key.' };
  if (![1280, 1920].includes(options.width) || ![720, 1080].includes(options.height)) return { ok: false, message: 'Choose a supported output resolution.' };
  if (![30, 60].includes(options.frameRate) || ![2500, 4500, 6000].includes(options.bitrate)) return { ok: false, message: 'Choose a supported frame rate and bitrate.' };
  const capture = options.capture;
  if (![capture.x, capture.y, capture.width, capture.height].every(Number.isFinite) || capture.width < 100 || capture.height < 50) {
    return { ok: false, message: 'The on-air preview is not ready to capture.' };
  }

  // Facebook keys may contain query parameters; keep the copied key intact when building the ingest URL.
  const streamEndpoint = `${endpoint.href.replace(/\/+$/, '')}/${options.streamKey.trim().replace(/^\/+/, '')}`;
  const ffmpegArgs = [
    '-hide_banner', '-loglevel', 'info', '-stats', '-stats_period', '1',
    '-f', 'image2pipe', '-framerate', String(options.frameRate), '-vcodec', 'png', '-i', 'pipe:0',
    '-f', 'webm', '-i', 'pipe:3',
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', `scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    '-r', String(options.frameRate), '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
    '-g', String(options.frameRate * 2), '-keyint_min', String(options.frameRate * 2), '-sc_threshold', '0',
    '-b:v', `${options.bitrate}k`, '-maxrate', `${options.bitrate}k`, '-bufsize', `${options.bitrate * 2}k`,
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-f', 'flv', streamEndpoint,
  ];
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(ffmpegPath, ffmpegArgs, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;
  } catch {
    return { ok: false, message: 'Could not start the video encoder.' };
  }
  const session: StreamSession = { child, window, active: true };
  streamSession = session;
  sendStreamStatus(window, 'connecting', 'Connecting to Facebook Live…');

  child.once('error', () => {
    if (streamSession === session) streamSession = null;
    session.active = false;
    session.failed = true;
    sendStreamStatus(window, 'error', 'The video encoder could not start. Check the app installation and try again.');
  });
  child.stderr.on('data', (chunk: Buffer) => {
    const log = chunk.toString('utf8');
    if (/frame=\s*\d+/.test(log)) sendStreamStatus(window, 'live', 'Facebook is receiving the stream.');
    if (/connection refused|connection failed|server returned|error opening|invalid argument|could not write header|401|403|unauthorized|forbidden/i.test(log)) {
      const message = /401|403|unauthorized|forbidden/i.test(log)
        ? 'Facebook rejected the stream key or server URL. Check them in Live Producer.'
        : 'Could not connect to Facebook Live. Check your internet connection and server URL.';
      session.failed = true;
      stopStream();
      sendStreamStatus(window, 'error', message);
    }
  });
  child.once('close', (code) => {
    const wasCurrentSession = streamSession === session;
    if (streamSession === session) streamSession = null;
    session.active = false;
    if (session.failed) return;
    if (session.stopping || code === 0) sendStreamStatus(window, 'stopped', 'Stream ended.');
    else if (wasCurrentSession) sendStreamStatus(window, 'error', 'The stream encoder stopped unexpectedly.');
  });

  void (async () => {
    const interval = 1000 / options.frameRate;
    while (session.active && streamSession === session && !window.isDestroyed()) {
      const startedAt = Date.now();
      try {
        const frame = await window.webContents.capturePage(capture);
        if (!session.active || child.stdin.destroyed) break;
        if (!child.stdin.write(frame.toPNG())) await new Promise<void>((resolve) => child.stdin.once('drain', resolve));
      } catch {
        if (session.active) {
          session.failed = true;
          sendStreamStatus(window, 'error', 'Could not capture the on-air program output.');
        }
        stopStream();
        break;
      }
      await delay(Math.max(0, interval - (Date.now() - startedAt)));
    }
  })();
  return { ok: true };
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 700,
    minWidth: 920,
    minHeight: 620,
    autoHideMenuBar: true,
    title: 'FaithStream',

    // Use your custom icon during development.
    // The packaged app uses the icon configured in forge.config.mts.
    icon: path.join(
      app.getAppPath(),
      'src',
      'assets',
      'icons',
      'win',
      'camera-logo.ico',
    ),

    // Use the app's own titlebar controls so preview can hide them completely.
    titleBarStyle: 'hidden',

    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'F11' || input.alt || input.control || input.meta) return;
    event.preventDefault();
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });
  mainWindow.on('closed', () => {
    if (streamSession?.window === mainWindow) stopStream();
    if (recordingSession?.window === mainWindow) stopRecording(mainWindow);
  });

  // Load the Vite development server or the packaged renderer.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      ),
    );
  }

  // Uncomment this line when debugging is needed.
  // mainWindow.webContents.openDevTools();
};

app.whenReady().then(() => {
  ipcMain.handle('presentation:render-pptx', async (event, sourcePath: unknown) => {
    if (!BrowserWindow.fromWebContents(event.sender) || typeof sourcePath !== 'string' || sourcePath.length > 32_768) {
      return { ok: false, message: 'Choose a PowerPoint file to import.' };
    }
    try {
      const slides = await exportPowerPointSlides(sourcePath);
      return { ok: true, slides };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'PowerPoint could not render this file.' };
    }
  });
  ipcMain.handle('media:optimize-video', async (event, sourcePath: unknown) => {
    if (!BrowserWindow.fromWebContents(event.sender) || typeof sourcePath !== 'string' || sourcePath.length > 32_768) {
      return { ok: false, message: 'Choose a video file to optimize.' };
    }
    try {
      return await optimizeImportedVideo(sourcePath);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not optimize this video.' };
    }
  });
  ipcMain.handle('stream:start', (event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return { ok: false, message: 'Stream settings are incomplete.' };
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { ok: false, message: 'Studio window is unavailable.' };
    return startStream(window, payload as StreamStartOptions);
  });
  ipcMain.on('stream:audio', (event, payload: unknown) => {
    const session = streamSession;
    const chunk = ipcAudioBuffer(payload);
    if (!session || event.sender !== session.window.webContents || !chunk || chunk.byteLength > 1024 * 1024) return;
    const audioPipe = session.child.stdio[3];
    if (audioPipe instanceof Writable && !audioPipe.destroyed) audioPipe.write(chunk);
  });
  ipcMain.handle('stream:stop', (event) => {
    if (streamSession?.window.webContents !== event.sender) return false;
    return stopStream();
  });
  ipcMain.handle('recording:start', async (event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return { ok: false, message: 'Recording settings are incomplete.' };
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { ok: false, message: 'Studio window is unavailable.' };
    const capture = (payload as { capture?: StreamStartOptions['capture'] }).capture;
    if (!capture) return { ok: false, message: 'The On-air output is not ready to record.' };
    return startRecording(window, capture);
  });
  ipcMain.on('recording:audio', (event, payload: unknown) => {
    const session = recordingSession;
    const chunk = ipcAudioBuffer(payload);
    if (!session || event.sender !== session.window.webContents || !chunk || chunk.byteLength > 1024 * 1024) return;
    const audioPipe = session.child.stdio[3];
    if (audioPipe instanceof Writable && !audioPipe.destroyed) audioPipe.write(chunk);
  });
  ipcMain.handle('recording:stop', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window ? stopRecording(window) : false;
  });

  ipcMain.handle('studio:get-displays', () => {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((display, index) => ({
      id: display.id,
      name: `Monitor ${index + 1}${display.id === primaryId ? ' (Primary)' : ''}`,
      primary: display.id === primaryId,
      bounds: display.bounds,
    }));
  });
  ipcMain.handle('studio:open-display', (_event, displayId: unknown) => {
    if (typeof displayId !== 'number' || !Number.isFinite(displayId)) return { ok: false, message: 'Choose a connected monitor.' };
    const display = screen.getAllDisplays().find((item) => item.id === displayId);
    if (!display) return { ok: false, message: 'That monitor is no longer connected.' };
    const existing = studioDisplayWindows.get(display.id);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return { ok: true };
    }
    const outputWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      fullscreen: true,
      autoHideMenuBar: true,
      backgroundColor: '#000000',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
    });
    studioDisplayWindows.set(display.id, outputWindow);
    outputWindow.on('closed', () => { studioDisplayWindows.delete(display.id); });
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      outputWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/studio-output`);
    } else {
      outputWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), { hash: '/studio-output' });
    }
    return { ok: true };
  });
  ipcMain.handle('studio:close-display', (event) => {
    const outputWindow = [...studioDisplayWindows.values()].find((window) => !window.isDestroyed() && window.webContents === event.sender);
    if (!outputWindow) return false;
    outputWindow.close();
    return true;
  });

  ipcMain.handle('presentation:set-fullscreen', (event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return false;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    window.setFullScreen(enabled);
    return true;
  });

  ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle('window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
    return true;
  });
  ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle('window:set-authenticated-mode', (event, authenticated: unknown) => {
    if (typeof authenticated !== 'boolean') return false;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    if (authenticated) {
      window.setMinimumSize(1100, 700);
      const { workArea } = screen.getDisplayMatching(window.getBounds());
      window.setBounds(workArea);
      window.show();
      window.setFullScreen(false);
      window.focus();
    } else {
      const restoreLoginWindow = () => {
        if (window.isDestroyed()) return;
        if (window.isMaximized()) window.unmaximize();
        window.setMinimumSize(920, 620);
        window.setSize(1024, 700);
        window.center();
      };
      if (window.isFullScreen()) {
        let restored = false;
        let restoreTimer: ReturnType<typeof setTimeout> | undefined;
        const finishRestore = () => {
          if (restored) return;
          restored = true;
          if (restoreTimer) clearTimeout(restoreTimer);
          window.removeListener('leave-full-screen', finishRestore);
          restoreLoginWindow();
        };
        window.once('leave-full-screen', finishRestore);
        restoreTimer = setTimeout(finishRestore, 600);
        window.setFullScreen(false);
      } else {
        restoreLoginWindow();
      }
    }
    return true;
  });

  // Remove the default File, Edit, View, and Window menus.
  Menu.setApplicationMenu(null);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopStream();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', stopStream);
