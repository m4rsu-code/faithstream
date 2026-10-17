import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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

let streamSession: StreamSession | null = null;
const studioDisplayWindows = new Map<number, BrowserWindow>();

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
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
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
  mainWindow.on('closed', () => {
    if (streamSession?.window === mainWindow) stopStream();
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
  ipcMain.handle('stream:start', (event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return { ok: false, message: 'Stream settings are incomplete.' };
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { ok: false, message: 'Studio window is unavailable.' };
    return startStream(window, payload as StreamStartOptions);
  });
  ipcMain.on('stream:audio', (event, payload: unknown) => {
    const session = streamSession;
    if (!session || event.sender !== session.window.webContents || !(payload instanceof ArrayBuffer) || payload.byteLength > 1024 * 1024) return;
    const audioPipe = session.child.stdio[3];
    if (audioPipe instanceof Writable && !audioPipe.destroyed) audioPipe.write(Buffer.from(payload));
  });
  ipcMain.handle('stream:stop', (event) => {
    if (streamSession?.window.webContents !== event.sender) return false;
    return stopStream();
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
