import { app, autoUpdater, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, protocol, safeStorage, screen, session, shell } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, watch as watchDirectory, type FSWatcher } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import started from 'electron-squirrel-startup';
import type { ApiRequestBody, ApiRequestPayload, ApiResponsePayload } from './shared/apiContracts';
import type { RecordingStatusEvent, StreamStatus } from './shared/streamContracts';
import type { UpdateStatusEvent } from './shared/updateContracts';
protocol.registerSchemesAsPrivileged([{ scheme: 'faithstream-local', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
// Ship the executable as a resource so Electron can always resolve it outside app.asar.
const ffmpegCandidatePath = app.isPackaged
  ? path.join(process.resourcesPath, 'ffmpeg.exe')
  : path.resolve(__dirname, '../../node_modules/ffmpeg-static/ffmpeg.exe');
const ffmpegPath = existsSync(ffmpegCandidatePath) ? ffmpegCandidatePath : null;
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
type PresentationBundleWriteSession = { window: BrowserWindow; filePath: string; writer: ReturnType<typeof createWriteStream>; error?: string };

let streamSession: StreamSession | null = null;
let recordingSession: RecordingSession | null = null;
const presentationBundleWriters = new Map<number, PresentationBundleWriteSession>();
const studioDisplayWindows = new Map<number, BrowserWindow>();
const STUDIO_AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.wma', '.webm']);
let authWindow: BrowserWindow | null = null;
let updateStatus: UpdateStatusEvent = { status: 'idle' };
let updateCheckInProgress = false;
const MOBILE_CAM_PAIRING_LIFETIME_MS = 3 * 60 * 1000;
const MAX_MOBILE_CAMERAS = 3;
type MobileCamRoom = { sourceId: number; code: string; expiresAt: number; studio: any | null; phone: any | null; phoneAddress: string | null; invalidAttempts: number };
const mobileCamRooms = new Map<number, { server: any; room: MobileCamRoom }>();
const studioMusicPaths = new Map<string, string>();
const studioBackgroundPaths = new Map<string, string>();
const studioBackgroundWatchers: FSWatcher[] = [];
const backgroundThumbnailQueue: { sourcePath: string; thumbnailPath: string }[] = [];
const backgroundThumbnailJobs = new Set<string>();
let backgroundThumbnailWorkers = 0;
let backgroundThumbnailsSinceNotify = 0;
const STUDIO_BACKGROUND_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.png', '.jpg', '.jpeg', '.webp']);
const bundledBackgroundsPath = () => {
  if (app.isPackaged) return path.join(process.resourcesPath, 'backgrounds');
  const buildRelative = path.resolve(__dirname, '..', '..', 'backgrounds');
  const appRelative = path.join(app.getAppPath(), 'backgrounds');
  return existsSync(buildRelative) ? buildRelative : appRelative;
};
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const normalizeAddress = (address: string | undefined) => (address ?? '').replace(/^::ffff:/, '');
const authTokenPath = () => path.join(app.getPath('userData'), 'auth-token.bin');
const streamSettingsPath = () => path.join(app.getPath('userData'), 'stream-settings.bin');
const backgroundThumbnailsPath = () => path.join(app.getPath('userData'), 'background-thumbnails');

const sendBackgroundLibraryChanged = () => {
  if (authWindow && !authWindow.isDestroyed()) authWindow.webContents.send('presentation:backgrounds:changed');
};

const sendUpdateStatus = (status: UpdateStatusEvent['status'], message?: string) => {
  updateStatus = { status, ...(message ? { message } : {}) };
  if (authWindow && !authWindow.isDestroyed()) authWindow.webContents.send('app:update-status', updateStatus);
};

const checkForAppUpdates = () => {
  if (!isUpdateFeedConfigured) {
    sendUpdateStatus('not-configured', 'Updates will be available after the release feed is configured.');
    return false;
  }
  if (!app.isPackaged || process.platform !== 'win32') {
    sendUpdateStatus('not-configured', 'Updates are available in the installed Windows app.');
    return false;
  }
  if (updateCheckInProgress || updateStatus.status === 'downloading' || updateStatus.status === 'downloaded') return true;
  try {
    updateCheckInProgress = true;
    sendUpdateStatus('checking', 'Checking for updates…');
    autoUpdater.checkForUpdates();
    return true;
  } catch (error) {
    updateCheckInProgress = false;
    sendUpdateStatus('error', error instanceof Error ? error.message : 'Could not check for updates.');
    return false;
  }
};

const isUpdateFeedConfigured = typeof __FAITHSTREAM_UPDATE_FEED_URL__ !== 'undefined' && Boolean(__FAITHSTREAM_UPDATE_FEED_URL__.trim());

const processBackgroundThumbnailQueue = () => {
  while (backgroundThumbnailWorkers < 2 && backgroundThumbnailQueue.length) {
    const job = backgroundThumbnailQueue.shift()!;
    backgroundThumbnailWorkers += 1;
    const child = spawn(ffmpegPath!, [
      '-hide_banner', '-loglevel', 'error', '-ss', '0.5', '-i', job.sourcePath,
      '-frames:v', '1', '-vf', 'scale=480:270:force_original_aspect_ratio=decrease',
      '-q:v', '6', '-y', job.thumbnailPath,
    ], { windowsHide: true, stdio: 'ignore' });
    let finished = false;
    const finish = (success: boolean) => {
      if (finished) return;
      finished = true;
      backgroundThumbnailWorkers -= 1;
      backgroundThumbnailJobs.delete(job.thumbnailPath);
      if (success) backgroundThumbnailsSinceNotify += 1;
      if (backgroundThumbnailsSinceNotify >= 6 || (success && backgroundThumbnailWorkers === 0 && backgroundThumbnailQueue.length === 0)) {
        backgroundThumbnailsSinceNotify = 0;
        sendBackgroundLibraryChanged();
      }
      processBackgroundThumbnailQueue();
    };
    child.once('error', () => finish(false));
    child.once('close', (code) => finish(code === 0));
  }
};

const queueBackgroundThumbnail = (sourcePath: string, thumbnailPath: string) => {
  if (!ffmpegPath || existsSync(thumbnailPath) || backgroundThumbnailJobs.has(thumbnailPath)) return;
  backgroundThumbnailJobs.add(thumbnailPath);
  backgroundThumbnailQueue.push({ sourcePath, thumbnailPath });
  processBackgroundThumbnailQueue();
};

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

const FAITHSTREAM_API_BASE_URL = typeof __FAITHSTREAM_API_URL__ === 'string' && __FAITHSTREAM_API_URL__.trim()
  ? __FAITHSTREAM_API_URL__.trim().replace(/\/+$/, '')
  : 'http://127.0.0.1:8000/api';

const makeApiResponse = (status: number, message: string): ApiResponsePayload => ({
  status,
  statusText: status === 0 ? 'Network Error' : 'Request Error',
  headers: { 'content-type': 'application/json' },
  body: status === 0 ? '' : JSON.stringify({ message }),
});

const buildApiRequestBody = (body: ApiRequestBody | undefined): BodyInit | undefined => {
  if (!body) return undefined;
  if (body.kind === 'text') return body.value;
  const form = new FormData();
  for (const field of body.fields) {
    if ('value' in field) form.append(field.name, field.value);
    else {
      const fileBytes = Uint8Array.from(field.file.data).buffer as ArrayBuffer;
      form.append(field.name, new Blob([fileBytes], { type: field.file.type }), field.file.name);
    }
  }
  return form;
};

const apiBaseUrl = new URL(FAITHSTREAM_API_BASE_URL);
const apiBasePath = apiBaseUrl.pathname.replace(/\/+$/, '');

const sendApiRequest = async (event: Electron.IpcMainInvokeEvent, request: ApiRequestPayload): Promise<ApiResponsePayload> => {
  if (!isTrustedMainSender(event)) return makeApiResponse(403, 'This request is not allowed.');
  if (!request || typeof request.path !== 'string' || request.path.length > 2048 || request.path.startsWith('/') || request.path.includes('\\') || request.path.includes('://')) {
    return makeApiResponse(400, 'The API path is invalid.');
  }

  const method = typeof request.method === 'string' ? request.method.toUpperCase() : '';
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return makeApiResponse(405, 'This API method is not allowed.');

  let target: URL;
  try {
    target = new URL(request.path, `${FAITHSTREAM_API_BASE_URL}/`);
  } catch {
    return makeApiResponse(400, 'The API path is invalid.');
  }
  if (target.origin !== apiBaseUrl.origin || !target.pathname.startsWith(`${apiBasePath}/`)) {
    return makeApiResponse(400, 'The API path is outside the configured service.');
  }

  const headers = new Headers();
  for (const [name, value] of request.headers ?? []) {
    const normalizedName = name.toLowerCase();
    if (!['accept', 'authorization', 'content-type', 'x-requested-with'].includes(normalizedName) || typeof value !== 'string' || value.length > 8192) {
      return makeApiResponse(400, 'The API request headers are invalid.');
    }
    headers.set(normalizedName, value);
  }

  let body: BodyInit | undefined;
  try {
    body = buildApiRequestBody(request.body);
  } catch {
    return makeApiResponse(400, 'The API request body is invalid.');
  }
  const bodySize = request.body?.kind === 'text'
    ? Buffer.byteLength(request.body.value)
    : request.body?.kind === 'form'
      ? request.body.fields.reduce((size, field) => size + ('value' in field ? Buffer.byteLength(field.value) : field.file.data.byteLength), 0)
      : 0;
  if (bodySize > 15 * 1024 * 1024) return makeApiResponse(413, 'The API request is too large.');

  try {
    const response = await fetch(target, { method, headers, ...(body ? { body } : {}), redirect: 'error' });
    const contentType = response.headers.get('content-type');
    return {
      status: response.status,
      statusText: response.statusText,
      headers: contentType ? { 'content-type': contentType } : {},
      body: await response.text(),
    };
  } catch {
    return makeApiResponse(0, 'Could not reach the FaithStream API. Check the server address and network connection.');
  }
};

/** Monitor output windows need read access to the same built-in background library as Studio. */
const isStudioDisplayWindow = (sender: Electron.WebContents) =>
  [...studioDisplayWindows.values()].some((window) => !window.isDestroyed() && window.webContents === sender);
const isTrustedBackgroundLibrarySender = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) =>
  (isAuthWindow(event.sender) || isStudioDisplayWindow(event.sender)) && isAppUrl(event.senderFrame?.url);

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

type PowerPointTextRun = { textBase64: string; font?: string; size?: number; letterSpacing?: number; color?: string; bold?: boolean; italic?: boolean; underline?: boolean };
type PowerPointRenderedElement = { kind: 'text' | 'image' | 'shape'; shapeKind?: 'rectangle' | 'circle' | 'triangle' | 'star' | 'arrow'; order: number; x: number; y: number; w: number; h: number; textBase64?: string; textRuns?: PowerPointTextRun[]; font?: string; size?: number; letterSpacing?: number; lineHeight?: number; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; align?: 'left' | 'center' | 'right' | 'justify'; valign?: 'top' | 'middle' | 'bottom'; autoSize?: boolean; padding?: { top: number; right: number; bottom: number; left: number }; fillColor?: string; fillOpacity?: number; data?: string; mimeType?: string };
type PowerPointRenderedSlide = { name: string; width: number; height: number; backgroundColor: string; elements: PowerPointRenderedElement[] };
const exportPowerPointSlides = async (sourcePath: string): Promise<PowerPointRenderedSlide[]> => {
  const extension = path.extname(sourcePath).toLowerCase();
  if (process.platform !== 'win32') {
    throw new Error('PowerPoint import currently requires Windows with the desktop Microsoft PowerPoint app installed.');
  }
  if (!['.pptx', '.ppt'].includes(extension)) {
    throw new Error('Choose a PowerPoint presentation saved as .pptx or .ppt.');
  }
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'faithstream-pptx-'));
  const sourceBase64 = Buffer.from(sourcePath, 'utf8').toString('base64');
  const outputBase64 = Buffer.from(tempDir, 'utf8').toString('base64');
  const script = `
$ErrorActionPreference = 'Stop'
$source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sourceBase64}'))
$outDir = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${outputBase64}'))
function To-HexColor($value) {
  $number = [int]$value
  $red = $number -band 255
  $green = ($number -shr 8) -band 255
  $blue = ($number -shr 16) -band 255
  return ('#{0:X2}{1:X2}{2:X2}' -f $red, $green, $blue)
}
$app = $null
$presentation = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $presentation = $app.Presentations.Open($source, $true, $false, $false)
  $slideWidth = [double]$presentation.PageSetup.SlideWidth
  $slideHeight = [double]$presentation.PageSetup.SlideHeight
  $scale = [Math]::Min((1920.0 / $slideWidth), (1080.0 / $slideHeight))
  $renderWidth = [Math]::Max(1, [int][Math]::Round($slideWidth * $scale))
  $renderHeight = [Math]::Max(1, [int][Math]::Round($slideHeight * $scale))
  $slides = @()
  for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
    $slide = $presentation.Slides.Item($i)
    $elements = @()
    # Keep the slide background and inherited layout artwork as its own selectable image layer.
    $backgroundData = $null
    $backgroundSlide = $null
    try {
      $backgroundSlideRange = $slide.Duplicate()
      $backgroundSlide = $backgroundSlideRange.Item(1)
      for ($backgroundShapeIndex = $backgroundSlide.Shapes.Count; $backgroundShapeIndex -ge 1; $backgroundShapeIndex--) {
        $backgroundSlide.Shapes.Item($backgroundShapeIndex).Delete()
      }
      $backgroundFile = Join-Path $outDir ('slide-' + $i.ToString('D4') + '-background.png')
      $backgroundSlide.Export($backgroundFile, 'PNG', $renderWidth, $renderHeight)
      if ([IO.File]::Exists($backgroundFile)) {
        $backgroundData = [Convert]::ToBase64String([IO.File]::ReadAllBytes($backgroundFile))
      }
    } catch { }
    finally { if ($backgroundSlide -ne $null) { try { $backgroundSlide.Delete() } catch { } } }
    if ($backgroundData) {
      $elements += [PSCustomObject]@{
        kind = 'image'; order = 0; x = 0; y = 0; w = 100; h = 100
        data = $backgroundData; mimeType = 'image/png'
      }
    }
    $order = 0
    foreach ($shape in $slide.Shapes) {
      $order++
      try { $order = [int]$shape.ZOrderPosition } catch { }
      $left = [double]$shape.Left
      $top = [double]$shape.Top
      $width = [double]$shape.Width
      $height = [double]$shape.Height
      if ($width -le 0 -or $height -le 0) { continue }
      $hasText = $false
      try { $hasText = ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) } catch { $hasText = $false }
      if ($hasText) {
        try {
          $text = [string]$shape.TextFrame.TextRange.Text
          $text = $text.TrimEnd([char]13, [char]10).Replace([char]13, [char]10).Replace([char]11, [char]10)
          if ([string]::IsNullOrWhiteSpace($text)) { continue }
          $textBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))
          $textRuns = @()
          $font = $shape.TextFrame.TextRange.Font
          try {
            $runCount = $shape.TextFrame.TextRange.Runs().Count
            for ($runIndex = 1; $runIndex -le $runCount; $runIndex++) {
              $run = $shape.TextFrame.TextRange.Runs($runIndex, 1)
              $runText = [string]$run.Text
              if ($runIndex -eq $runCount) { $runText = $runText.TrimEnd([char]13, [char]10) }
              $runText = $runText.Replace([char]13, [char]10).Replace([char]11, [char]10)
              $runFont = $run.Font
              $runFontColor = '#FFFFFF'
              try { $runFontColor = To-HexColor $runFont.Color.RGB } catch { }
              $runFontName = [regex]::Replace([string]$runFont.Name, '[\x00-\x1F]', '')
              $runFontSize = [double]$runFont.Size
              if ($runFontSize -le 0) { $runFontSize = 24 }
              $runFontSpacing = 0.0
              try { $runFontSpacing = [double]$runFont.Spacing } catch { }
              $textRuns += [PSCustomObject]@{
                textBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($runText))
                font = $runFontName; size = $runFontSize; letterSpacing = $runFontSpacing; color = $runFontColor
                bold = ($runFont.Bold -eq -1); italic = ($runFont.Italic -eq -1); underline = ($runFont.Underline -ne 0)
              }
            }
            if ($textRuns.Count -gt 0) { $font = $shape.TextFrame.TextRange.Runs(1, 1).Font }
          } catch { $textRuns = @() }
          $fontName = [regex]::Replace([string]$font.Name, '[\x00-\x1F]', '')
          $fontSize = [double]$font.Size
          if ($fontSize -le 0) { $fontSize = 24 }
          $fontSpacing = 0.0
          try { $fontSpacing = [double]$font.Spacing } catch { }
          $fontColor = '#FFFFFF'
          try { $fontColor = To-HexColor $font.Color.RGB } catch { }
          $fillColor = '#000000'
          $fillOpacity = 0
          try {
            if ($shape.Fill.Visible -eq -1) {
              $fillColor = To-HexColor $shape.Fill.ForeColor.RGB
              $fillOpacity = [Math]::Round((1.0 - [double]$shape.Fill.Transparency) * 100)
            }
          } catch { }
          $lineHeight = 1.0
          try {
            $paragraphFormat = $shape.TextFrame.TextRange.ParagraphFormat
            $spaceWithin = [double]$paragraphFormat.SpaceWithin
            if ($spaceWithin -gt 0) {
              if ($paragraphFormat.LineRuleWithin -eq -1) { $lineHeight = $spaceWithin }
              elseif ($fontSize -gt 0) { $lineHeight = $spaceWithin / $fontSize }
            }
          } catch { }
          $lineHeight = [Math]::Max(0.5, [Math]::Min(3.0, $lineHeight))
          $align = 'left'
          try {
            switch ([int]$shape.TextFrame.TextRange.ParagraphFormat.Alignment) {
              2 { $align = 'center' }
              3 { $align = 'right' }
              4 { $align = 'justify' }
            }
          } catch { }
          $valign = 'middle'
          try {
            switch ([int]$shape.TextFrame.VerticalAnchor) {
              1 { $valign = 'top' }
              4 { $valign = 'bottom' }
            }
          } catch { }
          $elements += [PSCustomObject]@{
            kind = 'text'; order = $order
            x = [Math]::Round(($left / $slideWidth) * 100, 4); y = [Math]::Round(($top / $slideHeight) * 100, 4)
            w = [Math]::Round(($width / $slideWidth) * 100, 4); h = [Math]::Round(($height / $slideHeight) * 100, 4)
            textBase64 = $textBase64; textRuns = @($textRuns); font = $fontName; size = $fontSize; letterSpacing = $fontSpacing
            color = $fontColor; bold = ($font.Bold -eq -1); italic = ($font.Italic -eq -1)
            underline = ($font.Underline -ne 0); align = $align; valign = $valign; lineHeight = $lineHeight
            autoSize = ([int]$shape.TextFrame.AutoSize -eq 2)
            padding = @{ top = [double]$shape.TextFrame.MarginTop; right = [double]$shape.TextFrame.MarginRight; bottom = [double]$shape.TextFrame.MarginBottom; left = [double]$shape.TextFrame.MarginLeft }
            fillColor = $fillColor; fillOpacity = $fillOpacity
          }
          continue
        } catch { }
      }
      $nativeShape = $null
      try {
        switch ([int]$shape.AutoShapeType) {
          1 { $nativeShape = 'rectangle' }
          7 { $nativeShape = 'triangle' }
          9 { $nativeShape = 'circle' }
          12 { $nativeShape = 'star' }
          13 { $nativeShape = 'arrow' }
        }
      } catch { }
      if ($nativeShape) {
        try {
          $shapeFill = To-HexColor $shape.Fill.ForeColor.RGB
          $elements += [PSCustomObject]@{
            kind = 'shape'; shapeKind = $nativeShape; order = $order; fillColor = $shapeFill
            x = [Math]::Round(($left / $slideWidth) * 100, 4); y = [Math]::Round(($top / $slideHeight) * 100, 4)
            w = [Math]::Round(($width / $slideWidth) * 100, 4); h = [Math]::Round(($height / $slideHeight) * 100, 4)
          }
          continue
        } catch { }
      }
      $file = Join-Path $outDir ('slide-' + $i.ToString('D4') + '-shape-' + $order.ToString('D4') + '.png')
      try {
        $shape.Export($file, 2, $renderWidth, $renderHeight, 1)
        if ([IO.File]::Exists($file)) {
          $elements += [PSCustomObject]@{
            kind = 'image'; order = $order
            x = [Math]::Round(($left / $slideWidth) * 100, 4); y = [Math]::Round(($top / $slideHeight) * 100, 4)
            w = [Math]::Round(($width / $slideWidth) * 100, 4); h = [Math]::Round(($height / $slideHeight) * 100, 4)
            data = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file)); mimeType = 'image/png'
          }
        }
      } catch { }
    }
    $backgroundColor = '#101820'
    try { if ($slide.Background.Fill.Visible -eq -1) { $backgroundColor = To-HexColor $slide.Background.Fill.ForeColor.RGB } } catch { }
    # Return PowerPoint's actual point dimensions. The visual export above may be capped
    # for storage/render performance, but that export size must never
    # become the editable canvas size or the font-size conversion basis.
    $slides += [PSCustomObject]@{ name = ('Slide ' + $i); width = $slideWidth; height = $slideHeight; backgroundColor = $backgroundColor; elements = @($elements) }
  }
  ConvertTo-Json -InputObject @($slides) -Compress -Depth 8
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
    const slides = JSON.parse(json) as PowerPointRenderedSlide[];
    if (!Array.isArray(slides) || slides.length === 0) throw new Error('No slides were found in this PowerPoint file.');
    return slides;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'PowerPoint could not open this file.';
    if (/class not registered|class factory|80040154/i.test(detail)) {
      throw new Error('The desktop Microsoft PowerPoint app is not installed or registered on this computer. Install or repair PowerPoint, then try again.');
    }
    if (/password|encrypted|protected|permission/i.test(detail)) {
      throw new Error('This PowerPoint file is password-protected or restricted. Remove its protection in PowerPoint, save a copy, and import that copy.');
    }
    if (/corrupt|damaged|repair|invalid file/i.test(detail)) {
      throw new Error('PowerPoint could not read this file. Open it in PowerPoint, repair or resave it as .pptx, then import the new copy.');
    }
    throw error;
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
    show: false,
    backgroundColor: '#101923',

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
  const mainWindowContentsId = mainWindow.webContents.id;
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow.isDestroyed()) mainWindow.show();
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
    const bundleWrite = presentationBundleWriters.get(mainWindowContentsId);
    if (bundleWrite) {
      presentationBundleWriters.delete(mainWindowContentsId);
      bundleWrite.writer.destroy();
      void rm(bundleWrite.filePath, { force: true }).catch(() => undefined);
    }
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
  // Squirrel starts the app with an install/update argument to register shortcuts.
  // Do not create the Studio window during that installer hook.
  if (started) return;

  if (app.isPackaged && process.platform === 'win32' && isUpdateFeedConfigured) {
    autoUpdater.setFeedURL({ url: __FAITHSTREAM_UPDATE_FEED_URL__.trim().replace(/\/$/, '') });
    autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking', 'Checking for updates…'));
    // Electron's built-in Windows updater downloads in the background but does
    // not expose a download-progress event. The downloaded event signals when
    // the installer is ready to run.
    autoUpdater.on('update-available', () => sendUpdateStatus('downloading', 'A new FaithStream Studio update is downloading. The install button will appear when it is ready.'));
    autoUpdater.on('update-not-available', () => {
      updateCheckInProgress = false;
      sendUpdateStatus('not-available', 'You’re using the latest version.');
    });
    autoUpdater.on('update-downloaded', () => {
      updateCheckInProgress = false;
      sendUpdateStatus('downloaded', 'The update is ready. Restart FaithStream Studio to install it.');
    });
    autoUpdater.on('error', (error) => {
      updateCheckInProgress = false;
      sendUpdateStatus('error', error.message || 'Could not download the update.');
    });
  } else if (process.platform === 'win32') {
    sendUpdateStatus('not-configured', app.isPackaged
      ? 'Updates will be available after the release feed is configured.'
      : 'Updates can be checked in the installed Windows app.');
  }

  const backgroundsFolder = bundledBackgroundsPath();
  void mkdir(backgroundsFolder, { recursive: true }).then(() => {
    const watcher = watchDirectory(backgroundsFolder, { persistent: false }, () => {
      if (authWindow && !authWindow.isDestroyed()) authWindow.webContents.send('presentation:backgrounds:changed');
    });
    watcher.on('error', () => watcher.close());
    studioBackgroundWatchers.push(watcher);
  }).catch(() => { /* Folder access is retried when the library asks for its contents. */ });
  protocol.handle('faithstream-local', async (request) => {
    const mediaUrl = new URL(request.url);
    const id = decodeURIComponent(mediaUrl.pathname.replace(/^\//, ''));
    const filePath = mediaUrl.hostname === 'backgrounds' ? studioBackgroundPaths.get(id) : mediaUrl.hostname === 'music' ? studioMusicPaths.get(id) : undefined;
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
      const contentType: Record<string, string> = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.wma': 'audio/x-ms-wma' };
      const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Content-Type': contentType[ext] ?? 'application/octet-stream', 'Content-Length': String(Math.max(0, end - start + 1)), 'Access-Control-Allow-Origin': '*' });
      if (status === 206) headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`);
      if (request.method === 'HEAD') return new Response(null, { status, headers });
      return new Response(Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>, { status, headers });
    } catch {
      return new Response('Music file is unavailable', { status: 404 });
    }
  });

  ipcMain.handle('api:request', sendApiRequest);
  ipcMain.handle('auth:token:get', async (event) => {
    if (!isTrustedMainSender(event) || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(await readFile(authTokenPath()));
    } catch {
      return null;
    }
  });
  ipcMain.handle('app:update:status', (event) => isTrustedMainSender(event) ? updateStatus : { status: 'error', message: 'Open FaithStream Studio to check for updates.' });
  ipcMain.handle('app:update:check', (event) => isTrustedMainSender(event) ? checkForAppUpdates() : false);
  ipcMain.handle('app:update:install', (event) => {
    if (!isTrustedMainSender(event) || updateStatus.status !== 'downloaded') return false;
    setTimeout(() => autoUpdater.quitAndInstall(), 100);
    return true;
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
  ipcMain.handle('presentation:backgrounds:list', async (event) => {
    if (!isTrustedBackgroundLibrarySender(event)) return [];
    const roots = [{ folder: bundledBackgroundsPath(), collection: 'Built-in' }];
    const items: { id: string; name: string; type: 'image' | 'video'; collection: string; url: string; size: number; thumbnailUrl?: string }[] = [];
    studioBackgroundPaths.clear();
    await mkdir(backgroundThumbnailsPath(), { recursive: true });
    for (const root of roots) {
      try {
        await mkdir(root.folder, { recursive: true });
        const files = await readdir(root.folder, { withFileTypes: true });
        for (const entry of files) {
          if (!entry.isFile() || !STUDIO_BACKGROUND_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
          const filePath = path.join(root.folder, entry.name);
          const info = await stat(filePath);
          if (!info.isFile()) continue;
          const id = createHash('sha256').update(`${root.collection}:${entry.name}`).digest('hex').slice(0, 24);
          studioBackgroundPaths.set(id, filePath);
          const extension = path.extname(entry.name).toLowerCase();
          const type = ['.png', '.jpg', '.jpeg', '.webp'].includes(extension) ? 'image' : 'video';
          const thumbnailKey = createHash('sha256').update(`${filePath}:${info.size}:${info.mtimeMs}`).digest('hex');
          const thumbnailPath = path.join(backgroundThumbnailsPath(), `${thumbnailKey}.jpg`);
          const thumbnailId = `thumbnail-${id}`;
          const thumbnailUrl = type === 'video' && existsSync(thumbnailPath) ? `faithstream-local://backgrounds/${thumbnailId}` : undefined;
          if (thumbnailUrl) studioBackgroundPaths.set(thumbnailId, thumbnailPath);
          items.push({ id: `folder-default-${id}`, name: entry.name, type, collection: root.collection, url: `faithstream-local://backgrounds/${id}`, size: info.size, ...(thumbnailUrl ? { thumbnailUrl } : {}) });
        }
      } catch {
        // An absent or unreadable background folder should not prevent the editor opening.
      }
    }
    return items.sort((a, b) => a.collection.localeCompare(b.collection) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  });
  ipcMain.handle('presentation:backgrounds:prepare-thumbnails', async (event, requestedIds: unknown) => {
    if (!isTrustedMainSender(event) || !ffmpegPath) return false;
    try {
      const requested = Array.isArray(requestedIds)
        ? new Set(requestedIds.filter((id): id is string => typeof id === 'string' && id.startsWith('folder-default-')).map((id) => id.slice('folder-default-'.length)))
        : null;
      if (requested && requested.size === 0) return true;
      const folder = bundledBackgroundsPath();
      const cacheFolder = backgroundThumbnailsPath();
      await Promise.all([mkdir(folder, { recursive: true }), mkdir(cacheFolder, { recursive: true })]);
      const files = await readdir(folder, { withFileTypes: true });
      for (const entry of files) {
        const extension = path.extname(entry.name).toLowerCase();
        if (!entry.isFile() || !STUDIO_BACKGROUND_EXTENSIONS.has(extension) || ['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) continue;
        const sourcePath = path.join(folder, entry.name);
        const assetId = createHash('sha256').update(`Built-in:${entry.name}`).digest('hex').slice(0, 24);
        if (requested && !requested.has(assetId)) continue;
        const info = await stat(sourcePath);
        if (!info.isFile()) continue;
        const key = createHash('sha256').update(`${sourcePath}:${info.size}:${info.mtimeMs}`).digest('hex');
        queueBackgroundThumbnail(sourcePath, path.join(cacheFolder, `${key}.jpg`));
      }
      return true;
    } catch {
      return false;
    }
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

  ipcMain.handle('presentation:portable-export:start', async (event, suggestedName: unknown) => {
    if (!isTrustedMainSender(event)) return { ok: false, message: 'Export presentations from FaithStream Studio.' };
    if (presentationBundleWriters.has(event.sender.id)) return { ok: false, message: 'A presentation backup is already being saved.' };
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { ok: false, message: 'The Studio window is unavailable.' };
    const safeName = (typeof suggestedName === 'string' ? path.basename(suggestedName) : 'FaithStream presentation')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').slice(0, 120) || 'FaithStream presentation';
    const chosen = window
      ? await dialog.showSaveDialog(window, { title: 'Save portable presentation', defaultPath: path.join(app.getPath('documents'), `${safeName}.fspresentation`), filters: [{ name: 'FaithStream portable presentation', extensions: ['fspresentation'] }] })
      : await dialog.showSaveDialog({ title: 'Save portable presentation', defaultPath: path.join(app.getPath('documents'), `${safeName}.fspresentation`), filters: [{ name: 'FaithStream portable presentation', extensions: ['fspresentation'] }] });
    if (chosen.canceled || !chosen.filePath) return { ok: false, canceled: true };
    const filePath = chosen.filePath.toLowerCase().endsWith('.fspresentation') ? chosen.filePath : `${chosen.filePath}.fspresentation`;
    const writer = createWriteStream(filePath);
    const session: PresentationBundleWriteSession = { window, filePath, writer };
    try {
      await new Promise<void>((resolve, reject) => {
        writer.once('open', () => resolve());
        writer.once('error', reject);
      });
    } catch {
      writer.destroy();
      return { ok: false, message: 'Could not create the backup file. Check that the destination is writable.' };
    }
    writer.on('error', (error) => { session.error = error.message; });
    presentationBundleWriters.set(event.sender.id, session);
    return { ok: true };
  });
  ipcMain.handle('presentation:portable-export:write', async (event, payload: unknown) => {
    const session = presentationBundleWriters.get(event.sender.id);
    const chunk = ipcAudioBuffer(payload);
    if (!isTrustedMainSender(event) || !session || session.window.webContents !== event.sender || !chunk || chunk.byteLength > 1024 * 1024) {
      return { ok: false, message: 'The presentation backup stream is unavailable.' };
    }
    if (session.error) return { ok: false, message: session.error };
    return new Promise<{ ok: boolean; message?: string }>((resolve) => {
      session.writer.write(chunk, (error) => resolve(error ? { ok: false, message: error.message } : { ok: true }));
    });
  });
  ipcMain.handle('presentation:portable-export:finish', async (event) => {
    const session = presentationBundleWriters.get(event.sender.id);
    if (!isTrustedMainSender(event) || !session || session.window.webContents !== event.sender) return { ok: false, message: 'The presentation backup stream is unavailable.' };
    presentationBundleWriters.delete(event.sender.id);
    const result = await new Promise<{ ok: boolean; message?: string }>((resolve) => {
      session.writer.end(() => resolve(session.error ? { ok: false, message: session.error } : { ok: true }));
      session.writer.once('error', (error) => resolve({ ok: false, message: error.message }));
    });
    if (!result.ok) {
      await rm(session.filePath, { force: true }).catch(() => undefined);
      return result;
    }
    return { ...result, filePath: session.filePath };
  });
  ipcMain.handle('presentation:portable-export:cancel', async (event) => {
    const session = presentationBundleWriters.get(event.sender.id);
    if (!isTrustedMainSender(event) || !session || session.window.webContents !== event.sender) return false;
    presentationBundleWriters.delete(event.sender.id);
    const closed = new Promise<void>((resolve) => {
      if (session.writer.closed || session.writer.destroyed) { resolve(); return; }
      session.writer.once('close', resolve);
    });
    session.writer.destroy();
    await closed;
    await rm(session.filePath, { force: true }).catch(() => undefined);
    return true;
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

  // Squirrel holds a file lock briefly on the first run after installation.
  if (app.isPackaged && process.platform === 'win32' && isUpdateFeedConfigured && !process.argv.includes('--squirrel-firstrun')) {
    setTimeout(checkForAppUpdates, 10_000);
  }

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
