import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, screen } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { randomInt } from 'node:crypto';
import started from 'electron-squirrel-startup';
import ffmpegPath from 'ffmpeg-static';
const { WebSocketServer } = require('ws') as { WebSocketServer: new (options: { host: string; port: number; maxPayload?: number }) => any };

type StreamStartOptions = {
  serverUrl: string;
  streamKey: string;
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
};
type CaptureRect = { x: number; y: number; width: number; height: number };

type StreamSession = {
  child: ChildProcessWithoutNullStreams;
  window: BrowserWindow;
  active: boolean;
  connectTimer?: ReturnType<typeof setTimeout>;
  stderrBuffer: string;
  stderrTail: string[];
  videoFrames: number;
  videoBytes: number;
  audioBytes: number;
  latestVideoFrame: Buffer | null;
  frameTimer?: ReturnType<typeof setInterval>;
  hasEncodedOutput?: boolean;
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
let authWindow: BrowserWindow | null = null;
let mobileCamServer: any = null;
let mobileCamRoom: { code: string; studio: any | null; phone: any | null } | null = null;
const authTokenPath = () => path.join(app.getPath('userData'), 'auth-token.bin');
const streamSettingsPath = () => path.join(app.getPath('userData'), 'stream-settings.bin');

const isAuthWindow = (sender: Electron.WebContents) => authWindow?.webContents === sender;

const startMobileCamPairing = async (sender: Electron.WebContents) => {
  if (!isAuthWindow(sender)) return { ok: false, message: 'Open Studio to pair a phone camera.' };
  if (mobileCamServer) {
    mobileCamRoom?.studio?.close();
    mobileCamRoom?.phone?.close();
    mobileCamRoom = null;
    await new Promise<void>((resolve) => mobileCamServer.close(() => resolve()));
    mobileCamServer = null;
  }
  const server = new WebSocketServer({ host: '0.0.0.0', port: 0, maxPayload: 64 * 1024 });
  mobileCamServer = server;
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') return { ok: false, message: 'Could not start local camera pairing.' };
  const code = String(randomInt(100000, 1000000));
  const room = { code, studio: null as any, phone: null as any };
  let invalidAttempts = 0;
  mobileCamRoom = room;
  server.on('connection', (socket: any, request: { url?: string }) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const role = url.searchParams.get('role');
    if (url.searchParams.get('code') !== room.code || (role !== 'studio' && role !== 'phone')) {
      invalidAttempts += 1;
      socket.close(1008, 'Invalid pairing code');
      if (invalidAttempts >= 12) {
        mobileCamRoom = null;
        mobileCamServer = null;
        server.close();
      }
      return;
    }
    const key = role === 'studio' ? 'studio' : 'phone';
    const peerKey = role === 'studio' ? 'phone' : 'studio';
    room[key]?.close(1012, 'Replaced by a new connection');
    room[key] = socket;
    socket.send(JSON.stringify({ type: 'joined' }));
    if (room.studio && room.phone) {
      room.studio.send(JSON.stringify({ type: 'peer-ready' }));
      room.phone.send(JSON.stringify({ type: 'peer-ready' }));
    }
    socket.on('message', (data: Buffer) => {
      if (data.byteLength > 64 * 1024) return;
      const peer = room[peerKey];
      if (peer?.readyState === 1) peer.send(data.toString('utf8'));
    });
    socket.on('close', () => { if (room[key] === socket) room[key] = null; });
  });
  const addresses = Object.values(os.networkInterfaces()).flat().filter((item): item is NonNullable<typeof item> => !!item && item.family === 'IPv4' && !item.internal).map((item) => item.address);
  return { ok: true, port: address.port, code, addresses };
};

const protectWindowNavigation = (window: BrowserWindow) => {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, nextUrl) => {
    try {
      const current = new URL(window.webContents.getURL());
      const next = new URL(nextUrl);
      const sameApp = current.protocol === 'file:'
        ? next.protocol === 'file:' && next.pathname === current.pathname
        : next.origin === current.origin;
      if (!sameApp) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
};

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
  if (session.frameTimer) clearInterval(session.frameTimer);
  if (!session.window.isDestroyed()) session.window.webContents.setBackgroundThrottling(true);
  if (!session.child.stdin.destroyed && session.child.stdin.writable) session.child.stdin.end();
  const audioPipe = session.child.stdio[3];
  if (audioPipe instanceof Writable && !audioPipe.destroyed && audioPipe.writable) audioPipe.end();
  const killTimer = setTimeout(() => session.child.kill(), 5000);
  session.child.once('close', () => clearTimeout(killTimer));
  if (!session.failed) sendStreamStatus(session.window, 'stopping');
  return true;
};

const reportStreamPipeError = (session: StreamSession, error: unknown) => {
  if (session.failed || session.stopping) return;
  session.failed = true;
  clearTimeout(session.connectTimer);
  const detail = error instanceof Error ? error.message : 'The encoder input pipe closed.';
  const message = `The stream encoder closed its input pipe (${detail}). Check the stream connection and try again.`;
  if (streamSession === session) stopStream();
  else {
    session.active = false;
    session.child.kill();
  }
  sendStreamStatus(session.window, 'error', message);
};

const startRecording = async (window: BrowserWindow, capture: CaptureRect) => {
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
  const handleRecordingPipeError = (error: Error) => {
    encoderError = (encoderError + `\nInput pipe: ${error.message}`).slice(-2000);
    session.failed = true;
    session.active = false;
    child.kill();
  };
  child.stdin.on('error', handleRecordingPipeError);
  const recordingAudioPipe = child.stdio[3];
  if (recordingAudioPipe instanceof Writable) recordingAudioPipe.on('error', handleRecordingPipeError);

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
  if (!session.child.stdin.destroyed && session.child.stdin.writable) session.child.stdin.end();
  const audioPipe = session.child.stdio[3];
  if (audioPipe instanceof Writable && !audioPipe.destroyed && audioPipe.writable) audioPipe.end();
  return true;
};

const startStream = async (window: BrowserWindow, options: StreamStartOptions) => {
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
  if (![30, 60].includes(options.frameRate) || ![2500, 4500, 6000, 8000].includes(options.bitrate)) return { ok: false, message: 'Choose a supported frame rate and bitrate.' };
  // Facebook keys may contain query parameters; keep the copied key intact when building the ingest URL.
  const streamEndpoint = `${endpoint.href.replace(/\/+$/, '')}/${options.streamKey.trim().replace(/^\/+/, '')}`;
  const ffmpegArgs = [
    '-hide_banner', '-loglevel', 'info', '-stats', '-stats_period', '1',
    '-f', 'image2pipe', '-framerate', String(options.frameRate), '-vcodec', 'mjpeg', '-i', 'pipe:0',
    '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', 'pipe:3',
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', `scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    '-fps_mode', 'cfr', '-r', String(options.frameRate), '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-threads:v', '2',
    '-g', String(options.frameRate * 2), '-keyint_min', String(options.frameRate * 2), '-sc_threshold', '0',
    '-b:v', `${options.bitrate}k`, '-maxrate', `${options.bitrate}k`, '-bufsize', `${options.bitrate * 2}k`,
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'flv', streamEndpoint,
  ];
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(ffmpegPath, ffmpegArgs, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;
  } catch {
    return { ok: false, message: 'Could not start the video encoder.' };
  }
  const session: StreamSession = { child, window, active: true, stderrBuffer: '', stderrTail: [], videoFrames: 0, videoBytes: 0, audioBytes: 0, latestVideoFrame: null };
  streamSession = session;
  const getSafeFfmpegLog = () => [...session.stderrTail, session.stderrBuffer].join(' ').trim()
    .replaceAll(streamEndpoint, '[stream destination]')
    .replaceAll(options.streamKey.trim(), '[stream key]')
    .slice(-800);
  window.webContents.setBackgroundThrottling(false);
  sendStreamStatus(window, 'connecting', 'Connecting to Facebook Live…');
  session.connectTimer = setTimeout(() => {
    if (!session.active || session.failed) return;
    session.failed = true;
    const safeLog = getSafeFfmpegLog();
    const detail = session.videoFrames === 0
      ? 'Studio did not send any full-resolution video frames to FFmpeg.'
      : session.audioBytes === 0
        ? `Studio sent ${session.videoFrames} full-resolution video frames, but no audio data reached FFmpeg.`
        : `Studio sent ${session.videoFrames} full-resolution video frames and ${(session.audioBytes / 1024).toFixed(0)} KB of audio, but FFmpeg did not report encoded output. Check the RTMPS connection.`;
    stopStream();
    sendStreamStatus(window, 'error', `${detail}${safeLog ? ` FFmpeg: ${safeLog}` : ''}`);
  }, 30_000);

  // Keep the image2pipe timeline moving at real time even when rendering a new
  // canvas frame takes longer than one frame interval. Reuse the latest image
  // between updates instead of letting FFmpeg timestamp a 6 fps feed as 60 fps.
  session.frameTimer = setInterval(() => {
    const frame = session.latestVideoFrame;
    if (!session.active || !frame || child.stdin.destroyed || !child.stdin.writable || child.stdin.writableLength > 2 * 1024 * 1024) return;
    try {
      child.stdin.write(frame);
      session.videoFrames += 1;
      session.videoBytes += frame.byteLength;
    } catch (error) {
      reportStreamPipeError(session, error);
    }
  }, 1000 / options.frameRate);

  child.stdin.on('error', (error) => reportStreamPipeError(session, error));
  const streamAudioPipe = child.stdio[3];
  if (streamAudioPipe instanceof Writable) streamAudioPipe.on('error', (error) => reportStreamPipeError(session, error));

  child.once('error', () => {
    if (session.failed) return;
    if (streamSession === session) streamSession = null;
    session.active = false;
    clearTimeout(session.connectTimer);
    if (!window.isDestroyed()) window.webContents.setBackgroundThrottling(true);
    session.failed = true;
    sendStreamStatus(window, 'error', 'The video encoder could not start. Check the app installation and try again.');
  });
  child.stderr.on('data', (chunk: Buffer) => {
    session.stderrBuffer += chunk.toString('utf8');
    const lines = session.stderrBuffer.split(/[\r\n]+/);
    session.stderrBuffer = lines.pop() ?? '';
    for (const log of lines) {
      const safeLog = log.trim().replaceAll(streamEndpoint, '[stream destination]').replaceAll(options.streamKey.trim(), '[stream key]');
      if (safeLog) {
        session.stderrTail.push(safeLog);
        if (session.stderrTail.length > 12) session.stderrTail.shift();
      }
      if (/frame=\s*\d+/.test(log)) {
        session.hasEncodedOutput = true;
        clearTimeout(session.connectTimer);
        sendStreamStatus(window, 'live', 'Facebook is receiving the stream.');
      }
      if (/connection refused|connection failed|connection timed out|operation timed out|failed to resolve|could not resolve|name or service not known|network is unreachable|network unreachable|tls.*(?:error|fail|fatal alert|alert)|ssl.*(?:error|fail|fatal alert|alert)|fatal alert.*(?:tls|ssl)|handshake.*(?:error|fail)|server returned|error opening|invalid argument|could not write header|i\/o error|\b(?:401|403)\b|unauthorized|forbidden/i.test(log)) {
        const invalidMedia = /ebml header parsing failed|invalid data found when processing input|error opening input/i.test(log);
        const tlsFailure = /(?:tls|ssl).*(?:fatal alert|error|fail|alert)|fatal alert.*(?:tls|ssl)/i.test(log);
        // FFmpeg's periodic stats are separate stderr lines from the final TLS
        // alert. Read the retained tail so a mid-stream disconnect is not
        // mislabeled as a handshake failure, and expose slow encoding when it
        // is the likely reason the ingest timed out.
        const safeLog = getSafeFfmpegLog();
        const speed = /speed=([0-9.]+)x/i.exec(`${log} ${safeLog}`)?.[1];
        const encodingIsBehind = speed !== undefined && Number(speed) < 0.9;
        const message = invalidMedia
          ? 'FFmpeg could not read the program video or audio input.'
          : tlsFailure
          ? session.hasEncodedOutput
            ? `The RTMPS connection closed after streaming had started.${encodingIsBehind ? ` FFmpeg was encoding at ${speed}x real time, so it could not keep up; try 720p at 30 fps.` : ' Check the network or server URL.'}`
            : 'The secure RTMPS connection was rejected during TLS setup. Verify the Facebook server URL; if it is correct, check whether a firewall, VPN, proxy, or network filter is interrupting the connection.'
          : /\b(?:401|403)\b|unauthorized|forbidden/i.test(log)
          ? 'Facebook rejected the stream key or server URL. Check them in Live Producer.'
          : /timed out|resolve|network unreachable|handshake/i.test(log)
            ? 'The RTMPS connection timed out or could not reach Facebook. Check your internet, firewall, VPN, and server URL.'
            : 'Could not connect to Facebook Live. Check the server URL and on-air output.';
        if (session.failed) break;
        session.failed = true;
        clearTimeout(session.connectTimer);
        stopStream();
        sendStreamStatus(window, 'error', `${message}${safeLog ? ` FFmpeg: ${safeLog}` : ''}`);
        break;
      }
    }
  });
  child.once('close', (code) => {
    clearTimeout(session.connectTimer);
    if (session.frameTimer) clearInterval(session.frameTimer);
    const wasCurrentSession = streamSession === session;
    if (streamSession === session) streamSession = null;
    session.active = false;
    if (!window.isDestroyed()) window.webContents.setBackgroundThrottling(true);
    if (session.failed) return;
    if (session.stopping) sendStreamStatus(window, 'stopped', 'Stream ended.');
    else if (wasCurrentSession) {
      const safeLog = getSafeFfmpegLog();
      const message = `The stream encoder stopped unexpectedly (exit code ${code ?? 'unknown'}).${safeLog ? ` FFmpeg: ${safeLog}` : ''}`;
      session.failed = true;
      sendStreamStatus(window, 'error', message);
    }
  });

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  authWindow = mainWindow;
  protectWindowNavigation(mainWindow);
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'F11' || input.alt || input.control || input.meta) return;
    event.preventDefault();
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });
  mainWindow.on('closed', () => {
    if (authWindow === mainWindow) authWindow = null;
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
  ipcMain.handle('auth:token:get', async (event) => {
    if (!isAuthWindow(event.sender) || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(await readFile(authTokenPath()));
    } catch {
      return null;
    }
  });
  ipcMain.handle('auth:token:set', async (event, token: unknown) => {
    if (!isAuthWindow(event.sender) || !safeStorage.isEncryptionAvailable() || typeof token !== 'string' || token.length > 4096) return false;
    try {
      await writeFile(authTokenPath(), safeStorage.encryptString(token));
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('auth:token:clear', async (event) => {
    if (!isAuthWindow(event.sender)) return false;
    try {
      await rm(authTokenPath(), { force: true });
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('stream-settings:get', async (event) => {
    if (!isAuthWindow(event.sender) || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return JSON.parse(safeStorage.decryptString(await readFile(streamSettingsPath()))) as { serverUrl: string; streamKey: string };
    } catch {
      return null;
    }
  });
  ipcMain.handle('stream-settings:save', async (event, payload: unknown) => {
    if (!isAuthWindow(event.sender) || !safeStorage.isEncryptionAvailable() || !payload || typeof payload !== 'object') return false;
    const settings = payload as { serverUrl?: unknown; streamKey?: unknown };
    if (typeof settings.serverUrl !== 'string' || settings.serverUrl.length > 2048 || typeof settings.streamKey !== 'string' || settings.streamKey.length > 4096) return false;
    try {
      await writeFile(streamSettingsPath(), safeStorage.encryptString(JSON.stringify({ serverUrl: settings.serverUrl, streamKey: settings.streamKey })));
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('mobile-cam:start-pairing', (event) => startMobileCamPairing(event.sender));
  ipcMain.handle('mobile-cam:stop-pairing', (event) => {
    if (!isAuthWindow(event.sender) || !mobileCamServer) return false;
    mobileCamRoom?.studio?.close();
    mobileCamRoom?.phone?.close();
    mobileCamRoom = null;
    mobileCamServer.close();
    mobileCamServer = null;
    return true;
  });

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
  ipcMain.on('stream:video-frame', (event, payload: unknown) => {
    const session = streamSession;
    const frame = ipcAudioBuffer(payload);
    if (!session || event.sender !== session.window.webContents || !frame || frame.byteLength < 4 || frame.byteLength > 8 * 1024 * 1024) return;
    if (frame[0] !== 0xff || frame[1] !== 0xd8 || frame[frame.byteLength - 2] !== 0xff || frame[frame.byteLength - 1] !== 0xd9) return;
    if (session.child.stdin.destroyed || !session.child.stdin.writable) return;
    session.latestVideoFrame = frame;
  });
  ipcMain.on('stream:audio', (event, payload: unknown) => {
    const session = streamSession;
    const chunk = ipcAudioBuffer(payload);
    if (!session || event.sender !== session.window.webContents || !chunk || chunk.byteLength > 1024 * 1024) return;
    const audioPipe = session.child.stdio[3];
    if (!(audioPipe instanceof Writable) || audioPipe.destroyed || !audioPipe.writable) return;
    session.audioBytes += chunk.byteLength;
    try {
      audioPipe.write(chunk);
    } catch (error) {
      reportStreamPipeError(session, error);
    }
  });
  ipcMain.handle('stream:stop', (event) => {
    if (streamSession?.window.webContents !== event.sender) return false;
    return stopStream();
  });
  ipcMain.handle('recording:start', async (event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return { ok: false, message: 'Recording settings are incomplete.' };
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { ok: false, message: 'Studio window is unavailable.' };
    const capture = (payload as { capture?: CaptureRect }).capture;
    if (!capture) return { ok: false, message: 'The On-air output is not ready to record.' };
    return startRecording(window, capture);
  });
  ipcMain.on('recording:audio', (event, payload: unknown) => {
    const session = recordingSession;
    const chunk = ipcAudioBuffer(payload);
    if (!session || event.sender !== session.window.webContents || !chunk || chunk.byteLength > 1024 * 1024) return;
    const audioPipe = session.child.stdio[3];
    if (audioPipe instanceof Writable && !audioPipe.destroyed && audioPipe.writable) {
      try { audioPipe.write(chunk); } catch { /* The recording error handler reports a closed encoder pipe. */ }
    }
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
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    protectWindowNavigation(outputWindow);
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
  mobileCamRoom?.studio?.close();
  mobileCamRoom?.phone?.close();
  mobileCamServer?.close();
  mobileCamServer = null;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopStream();
  mobileCamRoom?.studio?.close();
  mobileCamRoom?.phone?.close();
  mobileCamServer?.close();
  mobileCamServer = null;
});
