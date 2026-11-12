import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, protocol, safeStorage, screen, session, shell } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { randomInt, randomUUID } from 'node:crypto';
import started from 'electron-squirrel-startup';
import ffmpegStaticPath from 'ffmpeg-static';
import type { RecordingStatusEvent, StreamStatus } from './shared/streamContracts';
protocol.registerSchemesAsPrivileged([{ scheme: 'faithstream-local', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
// In a packaged app the binary is unpacked next to app.asar (see forge.config.mts).
// The OS cannot execute a file from inside the archive, so point spawn() at the unpacked copy.
const ffmpegPath = ffmpegStaticPath ? ffmpegStaticPath.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1') : null;
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
const STUDIO_AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.wma', '.webm']);
let authWindow: BrowserWindow | null = null;
const MOBILE_CAM_PAIRING_LIFETIME_MS = 3 * 60 * 1000;
const MAX_MOBILE_CAMERAS = 3;
type MobileCamRoom = { sourceId: number; code: string; expiresAt: number; studio: any | null; phone: any | null; phoneAddress: string | null; invalidAttempts: number };
const mobileCamRooms = new Map<number, { server: any; room: MobileCamRoom }>();
const studioMusicPaths = new Map<string, string>();
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const normalizeAddress = (address: string | undefined) => (address ?? '').replace(/^::ffff:/, '');
const authTokenPath = () => path.join(app.getPath('userData'), 'auth-token.bin');
const streamSettingsPath = () => path.join(app.getPath('userData'), 'stream-settings.bin');

const isAuthWindow = (sender: Electron.WebContents) => authWindow?.webContents === sender;

/** Tell Studio which monitors currently show output (or that monitors were plugged in or removed). */
const notifyStudioDisplaysChanged = () => {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.webContents.send('studio:displays-changed', [...studioDisplayWindows.entries()].filter(([, window]) => !window.isDestroyed()).map(([id]) => id));
  }
};

/** True only for pages that belong to this app (the Vite dev server or the packaged renderer). */
const isAppUrl = (rawUrl: string | undefined | null) => {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) return url.origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin;
    if (url.protocol !== 'file:') return false;
    const rendererIndex = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
    return path.normalize(decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1')).toLowerCase() === path.normalize(rendererIndex).toLowerCase();
  } catch {
    return false;
  }
};

/** IPC that touches files, the encoder, or the network must come from the main Studio window's own page. */
const isTrustedMainSender = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) =>
  isAuthWindow(event.sender) && isAppUrl(event.senderFrame?.url);

const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write']);

const configureSessionSecurity = () => {
  const ses = session.defaultSession;
  // Electron grants every permission by default; only allow what Studio actually uses.
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isAppUrl(webContents.getURL()));
  });
  ses.setPermissionCheckHandler((webContents, permission) => (
    ALLOWED_PERMISSIONS.has(permission) && !!webContents && isAppUrl(webContents.getURL())
  ));

  // Screen and desktop-audio sources use getDisplayMedia(), which Electron rejects unless
  // the app supplies a handler. Ask the operator which screen to share.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const frame = request.frame;
      if (!frame || !authWindow || authWindow.webContents.mainFrame !== frame.top || !isAppUrl(frame.url)) {
        callback({});
        return;
      }
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      if (!sources.length) { callback({}); return; }
      let chosen = sources[0];
      if (sources.length > 1 && authWindow) {
        const { response } = await dialog.showMessageBox(authWindow, {
          type: 'question',
          title: 'Share a screen',
          message: 'Which screen should FaithStream Studio capture?',
          buttons: [...sources.map((source, index) => source.name || `Screen ${index + 1}`), 'Cancel'],
          cancelId: sources.length,
          defaultId: 0,
          noLink: true,
        });
        if (response >= sources.length) { callback({}); return; }
        chosen = sources[response];
      }
      callback({
        video: chosen,
        ...(request.audioRequested && process.platform === 'win32' ? { audio: 'loopback' as const } : {}),
      });
    } catch {
      callback({});
    }
  });
};

const closeMobileCamRoom = (sourceId: number) => {
  const entry = mobileCamRooms.get(sourceId);
  if (!entry) return false;
  mobileCamRooms.delete(sourceId);
  entry.room.studio?.close(1000, 'Camera source removed');
  entry.room.phone?.close(1000, 'Camera source removed');
  entry.server.close();
  return true;
};

const closeAllMobileCamRooms = () => {
  for (const sourceId of [...mobileCamRooms.keys()]) closeMobileCamRoom(sourceId);
};

const startMobileCamPairing = async (sender: Electron.WebContents, sourceId: unknown) => {
  if (!isAuthWindow(sender)) return { ok: false, message: 'Open Studio to pair a phone camera.' };
  if (!Number.isSafeInteger(sourceId) || Number(sourceId) < 1) return { ok: false, message: 'Invalid camera source.' };
  const id = Number(sourceId);
  if (!mobileCamRooms.has(id) && mobileCamRooms.size >= MAX_MOBILE_CAMERAS) {
    return { ok: false, message: 'Up to three FaithStream Cam phones can be connected at once.' };
  }
  closeMobileCamRoom(id);
  const server = new WebSocketServer({ host: '0.0.0.0', port: 0, maxPayload: 64 * 1024 });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  } catch {
    try { server.close(); } catch { /* already closed */ }
    return { ok: false, message: 'Could not start local camera pairing. Check that your firewall allows FaithStream Studio.' };
  }
  server.on('error', () => { /* keep a socket error from crashing the main process */ });
  const address = server.address();
  if (!address || typeof address === 'string') return { ok: false, message: 'Could not start local camera pairing.' };
  const room: MobileCamRoom = {
    sourceId: id,
    code: String(randomInt(100000, 1000000)),
    expiresAt: Date.now() + MOBILE_CAM_PAIRING_LIFETIME_MS,
    studio: null,
    phone: null,
    phoneAddress: null,
    invalidAttempts: 0,
  };
  mobileCamRooms.set(id, { server, room });
  server.on('connection', (socket: any, request: { url?: string; socket?: { remoteAddress?: string } }) => {
    socket.on('error', () => socket.terminate?.());
    const url = new URL(request.url ?? '/', 'http://localhost');
    const role = url.searchParams.get('role');
    const remoteAddress = request.socket?.remoteAddress ?? '';
    const studioFromNetwork = role === 'studio' && !LOOPBACK_ADDRESSES.has(remoteAddress);
    const phoneNotBound = role === 'phone' && room.phoneAddress !== null && normalizeAddress(remoteAddress) !== room.phoneAddress;
    const expiredPairingCode = Date.now() >= room.expiresAt && room.phoneAddress === null;
    if (expiredPairingCode || url.searchParams.get('code') !== room.code || (role !== 'studio' && role !== 'phone') || studioFromNetwork || phoneNotBound) {
      room.invalidAttempts += 1;
      socket.close(1008, 'Invalid pairing code');
      if (room.invalidAttempts >= 12) {
        room.studio?.close(1008, 'Pairing locked');
        room.phone?.close(1008, 'Pairing locked');
        closeMobileCamRoom(id);
      }
      return;
    }
    const key = role === 'studio' ? 'studio' : 'phone';
    const peerKey = role === 'studio' ? 'phone' : 'studio';
    room[key]?.close(1012, 'Replaced by a new connection');
    room[key] = socket;
    if (key === 'phone') room.phoneAddress = normalizeAddress(remoteAddress);
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
    socket.on('close', () => {
      if (room[key] !== socket) return;
      room[key] = null;
      if (key === 'phone' && room.studio?.readyState === 1) room.studio.send(JSON.stringify({ type: 'phone-disconnected' }));
    });
  });
  const addresses = Object.values(os.networkInterfaces()).flat().filter((item): item is NonNullable<typeof item> => !!item && item.family === 'IPv4' && !item.internal).map((item) => item.address);
  return { ok: true, sourceId: id, port: address.port, code: room.code, expiresAt: room.expiresAt, addresses };
};

const renewMobileCamPairingCode = (sender: Electron.WebContents, sourceId: unknown) => {
  if (!isAuthWindow(sender) || !Number.isSafeInteger(sourceId)) return { ok: false, message: 'The FaithStream Cam pairing session has ended.' };
  const entry = mobileCamRooms.get(Number(sourceId));
  if (!entry) return { ok: false, message: 'The FaithStream Cam pairing session has ended.' };
  entry.room.code = String(randomInt(100000, 1000000));
  entry.room.expiresAt = Date.now() + MOBILE_CAM_PAIRING_LIFETIME_MS;
  if (!entry.room.phone) entry.room.phoneAddress = null;
  return { ok: true, sourceId: entry.room.sourceId, code: entry.room.code, expiresAt: entry.room.expiresAt };
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

const sendStreamStatus = (window: BrowserWindow, status: StreamStatus, message?: string) => {
  if (!window.isDestroyed()) window.webContents.send('stream:status', { status, message });
};
const sendRecordingStatus = (window: BrowserWindow, event: RecordingStatusEvent) => {
  if (!window.isDestroyed()) window.webContents.send('recording:status', event);
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
  if (!capture || typeof capture !== 'object' || ![capture.x, capture.y, capture.width, capture.height].every(Number.isFinite) || capture.width < 100 || capture.height < 50 || capture.width > 16384 || capture.height > 16384) {
    return { ok: false, message: 'The on-air preview is not ready to record.' };
  }
  const chosen = await dialog.showSaveDialog(window, {
    title: 'Save FaithStream Studio recording',
    defaultPath: path.join(app.getPath('videos'), `FaithStream Studio-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`),
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
    sendRecordingStatus(window, { status: 'error', message: 'The video encoder could not start.' });
  });
  child.once('close', (code) => {
    session.active = false;
    if (recordingSession === session) recordingSession = null;
    const detail = encoderError.trim().slice(-700);
    sendRecordingStatus(window, !session.failed && code === 0
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
  if (typeof options.serverUrl !== 'string' || typeof options.streamKey !== 'string' || options.serverUrl.length > 2048 || options.streamKey.length > 4096) {
    return { ok: false, message: 'Stream settings are incomplete.' };
  }
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

// Defence in depth for every window, including any created in the future:
// no <webview> tags, no pop-ups, and no navigating away from the app.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, nextUrl) => { if (!isAppUrl(nextUrl)) event.preventDefault(); });
  contents.on('will-redirect', (event, nextUrl) => { if (!isAppUrl(nextUrl)) event.preventDefault(); });
});

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
    title: 'FaithStream Studio',

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
  protocol.handle('faithstream-local', async (request) => {
    const id = new URL(request.url).pathname.replace(/^\//, '');
    const filePath = studioMusicPaths.get(id);
    if (!filePath || (request.method !== 'GET' && request.method !== 'HEAD')) return new Response('Not found', { status: 404 });
    try {
      const info = await stat(filePath);
      if (!info.isFile()) return new Response('Not found', { status: 404 });
      const range = request.headers.get('range');
      const rangeMatch = range && /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = 0;
      let end = info.size - 1;
      let status = 200;
      if (rangeMatch) {
        if (!rangeMatch[1] && rangeMatch[2]) start = Math.max(0, info.size - Number(rangeMatch[2]));
        else if (rangeMatch[1]) start = Number(rangeMatch[1]);
        if (rangeMatch[1] && rangeMatch[2]) end = Number(rangeMatch[2]);
        if (start > end || start >= info.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } });
        end = Math.min(end, info.size - 1);
        status = 206;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.wma': 'audio/x-ms-wma', '.webm': 'audio/webm' };
      const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Content-Type': contentType[ext] ?? 'application/octet-stream', 'Content-Length': String(Math.max(0, end - start + 1)), 'Access-Control-Allow-Origin': '*' });
      if (status === 206) headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`);
      if (request.method === 'HEAD') return new Response(null, { status, headers });
      return new Response(Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>, { status, headers });
    } catch {
      return new Response('Music file is unavailable', { status: 404 });
    }
  });

  ipcMain.handle('auth:token:get', async (event) => {
    if (!isTrustedMainSender(event) || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(await readFile(authTokenPath()));
    } catch {
      return null;
    }
  });
  ipcMain.handle('auth:token:set', async (event, token: unknown) => {
    if (!isTrustedMainSender(event) || !safeStorage.isEncryptionAvailable() || typeof token !== 'string' || token.length > 4096) return false;
    try {
      await writeFile(authTokenPath(), safeStorage.encryptString(token));
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('auth:token:clear', async (event) => {
    if (!isTrustedMainSender(event)) return false;
    try {
      await rm(authTokenPath(), { force: true });
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('stream-settings:get', async (event) => {
    if (!isTrustedMainSender(event) || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return JSON.parse(safeStorage.decryptString(await readFile(streamSettingsPath()))) as { serverUrl: string; streamKey: string };
    } catch {
      return null;
    }
  });
  ipcMain.handle('stream-settings:save', async (event, payload: unknown) => {
    if (!isTrustedMainSender(event) || !safeStorage.isEncryptionAvailable() || !payload || typeof payload !== 'object') return false;
    const settings = payload as { serverUrl?: unknown; streamKey?: unknown };
    if (typeof settings.serverUrl !== 'string' || settings.serverUrl.length > 2048 || typeof settings.streamKey !== 'string' || settings.streamKey.length > 4096) return false;
    try {
      await writeFile(streamSettingsPath(), safeStorage.encryptString(JSON.stringify({ serverUrl: settings.serverUrl, streamKey: settings.streamKey })));
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('mobile-cam:start-pairing', (event, sourceId: unknown) => (isTrustedMainSender(event) ? startMobileCamPairing(event.sender, sourceId) : { ok: false, message: 'Open Studio to pair a phone camera.' }));
  ipcMain.handle('mobile-cam:renew-code', (event, sourceId: unknown) => renewMobileCamPairingCode(event.sender, sourceId));
  ipcMain.handle('mobile-cam:stop-pairing', (event, sourceId: unknown) => {
    if (!isAuthWindow(event.sender) || !Number.isSafeInteger(sourceId)) return false;
    return closeMobileCamRoom(Number(sourceId));
  });

  ipcMain.handle('studio:music:register', async (event, sourcePath: unknown, name: unknown) => {
    if (!isTrustedMainSender(event) || typeof sourcePath !== 'string' || sourcePath.length > 32_768 || typeof name !== 'string' || name.length > 255) return { ok: false, message: 'Choose an audio file from this computer.' };
    try {
      const info = await stat(sourcePath);
      if (!info.isFile() || info.size <= 0 || !STUDIO_AUDIO_EXTENSIONS.has(path.extname(sourcePath).toLowerCase())) return { ok: false, message: 'Choose a supported audio file.' };
      const id = randomUUID();
      studioMusicPaths.set(id, sourcePath);
      return { ok: true, asset: { id, name: path.basename(name), path: sourcePath, url: `faithstream-local://music/${id}` } };
    } catch {
      return { ok: false, message: 'Could not access that audio file. Check that it still exists.' };
    }
  });
  ipcMain.handle('studio:music:resolve', async (event, assets: unknown) => {
    if (!isTrustedMainSender(event) || !Array.isArray(assets) || assets.length > 1000) return [];
    const resolved = [];
    for (const item of assets) {
      if (!item || typeof item.id !== 'string' || typeof item.path !== 'string' || item.path.length > 32_768 || typeof item.name !== 'string') continue;
      try {
        if (!(await stat(item.path)).isFile() || !STUDIO_AUDIO_EXTENSIONS.has(path.extname(item.path).toLowerCase())) {
          resolved.push({ id: item.id, name: item.name.slice(0, 255), path: item.path, createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0, url: '', available: false });
          continue;
        }
        studioMusicPaths.set(item.id, item.path);
        resolved.push({ id: item.id, name: item.name.slice(0, 255), path: item.path, createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0, url: `faithstream-local://music/${item.id}`, available: true });
      } catch {
        resolved.push({ id: item.id, name: item.name.slice(0, 255), path: item.path, createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0, url: '', available: false });
      }
    }
    return resolved;
  });
  ipcMain.handle('studio:music:remove', (event, id: unknown) => {
    if (!isTrustedMainSender(event) || typeof id !== 'string') return false;
    return studioMusicPaths.delete(id);
  });
  ipcMain.handle('presentation:render-pptx', async (event, sourcePath: unknown) => {
    if (!isTrustedMainSender(event) || typeof sourcePath !== 'string' || sourcePath.length > 32_768) {
      return { ok: false, message: 'Choose a PowerPoint file to import.' };
    }
    try {
      const slides = await exportPowerPointSlides(sourcePath);
      return { ok: true, slides };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'PowerPoint could not render this file.' };
    }
  });
  // Save a backup or songbook file wherever the user chooses (e.g. a USB flash drive).
  ipcMain.handle('files:save-text', async (event, suggestedName: unknown, content: unknown, kind: unknown) => {
    if (!isTrustedMainSender(event) || typeof content !== 'string' || content.length > 200 * 1024 * 1024) return { ok: false, message: 'Nothing to save.' };
    const window = BrowserWindow.fromWebContents(event.sender);
    const filter = kind === 'backup'
      ? { name: 'FaithStream Studio backup', extensions: ['fsbackup'] }
      : { name: 'FaithStream Studio songbook', extensions: ['fssongbook'] };
    const baseName = (typeof suggestedName === 'string' ? path.basename(suggestedName) : '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').slice(0, 120) || `FaithStream Studio.${filter.extensions[0]}`;
    const options = { title: kind === 'backup' ? 'Save FaithStream Studio backup' : 'Export songbook', defaultPath: path.join(app.getPath('documents'), baseName), filters: [filter] };
    const chosen = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (chosen.canceled || !chosen.filePath) return { ok: true, canceled: true };
    try {
      await writeFile(chosen.filePath, content, 'utf8');
      return { ok: true, filePath: chosen.filePath };
    } catch {
      return { ok: false, message: 'Could not save the file there. Check that the drive is connected and not full.' };
    }
  });

  ipcMain.handle('media:optimize-video', async (event, sourcePath: unknown) => {
    if (!isTrustedMainSender(event) || typeof sourcePath !== 'string' || sourcePath.length > 32_768) {
      return { ok: false, message: 'Choose a video file to optimize.' };
    }
    try {
      return await optimizeImportedVideo(sourcePath);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not optimize this video.' };
    }
  });
  ipcMain.handle('stream:start', (event, payload: unknown) => {
    if (!isTrustedMainSender(event)) return { ok: false, message: 'Start streaming from the Studio window.' };
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
    if (!isTrustedMainSender(event)) return { ok: false, message: 'Start recording from the Studio window.' };
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
  ipcMain.handle('studio:open-display', (event, displayId: unknown) => {
    if (!isTrustedMainSender(event)) return { ok: false, message: 'Open displays from the Studio window.' };
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
    outputWindow.on('closed', () => {
      if (studioDisplayWindows.get(display.id) === outputWindow) studioDisplayWindows.delete(display.id);
      notifyStudioDisplaysChanged();
    });
    notifyStudioDisplaysChanged();
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      outputWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/studio-output`);
    } else {
      outputWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), { hash: '/studio-output' });
    }
    return { ok: true };
  });
  ipcMain.handle('studio:get-open-displays', (event) => {
    if (!isTrustedMainSender(event)) return [];
    return [...studioDisplayWindows.entries()].filter(([, window]) => !window.isDestroyed()).map(([id]) => id);
  });
  ipcMain.handle('studio:close-displays', (event, displayIds: unknown) => {
    if (!isTrustedMainSender(event)) return false;
    const ids = Array.isArray(displayIds) ? displayIds.filter((id): id is number => typeof id === 'number' && Number.isFinite(id)) : [...studioDisplayWindows.keys()];
    for (const id of ids) {
      const outputWindow = studioDisplayWindows.get(id);
      if (outputWindow && !outputWindow.isDestroyed()) outputWindow.close();
    }
    return true;
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
  // The license screen links to the website; only http(s) is ever handed to the OS.
  ipcMain.handle('shell:open-external', async (event, url: unknown) => {
    if (!isTrustedMainSender(event) || typeof url !== 'string' || url.length > 2048) return false;
    try {
      const target = new URL(url);
      if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;
      await shell.openExternal(target.toString());
      return true;
    } catch {
      return false;
    }
  });
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

  configureSessionSecurity();

  // Keep Studio's monitor list current when a projector or TV is plugged in or removed.
  screen.on('display-added', notifyStudioDisplaysChanged);
  screen.on('display-removed', (_event, removed) => {
    const outputWindow = studioDisplayWindows.get(removed.id);
    if (outputWindow && !outputWindow.isDestroyed()) outputWindow.close();
    notifyStudioDisplaysChanged();
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
  closeAllMobileCamRooms();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopStream();
  closeAllMobileCamRooms();
});
