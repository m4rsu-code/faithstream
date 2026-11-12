import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { RecordingStatusEvent, StreamStatusEvent } from './shared/streamContracts';

contextBridge.exposeInMainWorld('faithstreamWindow', {
  getAuthToken: () => ipcRenderer.invoke('auth:token:get') as Promise<string | null>,
  getStreamSettings: () => ipcRenderer.invoke('stream-settings:get') as Promise<{ serverUrl: string; streamKey: string } | null>,
  saveStreamSettings: (settings: { serverUrl: string; streamKey: string }) => ipcRenderer.invoke('stream-settings:save', settings) as Promise<boolean>,
  saveAuthToken: (token: string) => ipcRenderer.invoke('auth:token:set', token) as Promise<boolean>,
  clearAuthToken: () => ipcRenderer.invoke('auth:token:clear') as Promise<boolean>,
  openExternalUrl: (url: string) => ipcRenderer.invoke('shell:open-external', url) as Promise<boolean>,
  getStudioDisplays: () => ipcRenderer.invoke('studio:get-displays'),
  registerStudioMusicFile: (file: File) => ipcRenderer.invoke('studio:music:register', webUtils.getPathForFile(file), file.name) as Promise<{ ok: boolean; asset?: { id: string; name: string; path: string; url: string }; message?: string }>,
  resolveStudioMusicFiles: (assets: { id: string; name: string; path: string; createdAt: number }[]) => ipcRenderer.invoke('studio:music:resolve', assets) as Promise<{ id: string; name: string; path: string; createdAt: number; url: string; available: boolean }[]>,
  removeStudioMusicFile: (id: string) => ipcRenderer.invoke('studio:music:remove', id) as Promise<boolean>,
  startMobileCamPairing: (sourceId: number) => ipcRenderer.invoke('mobile-cam:start-pairing', sourceId) as Promise<{ ok: boolean; sourceId?: number; port?: number; code?: string; expiresAt?: number; addresses?: string[]; message?: string }>,
  renewMobileCamPairingCode: (sourceId: number) => ipcRenderer.invoke('mobile-cam:renew-code', sourceId) as Promise<{ ok: boolean; sourceId?: number; code?: string; expiresAt?: number; message?: string }>,
  stopMobileCamPairing: (sourceId: number) => ipcRenderer.invoke('mobile-cam:stop-pairing', sourceId) as Promise<boolean>,
  openStudioDisplay: (displayId: number) => ipcRenderer.invoke('studio:open-display', displayId),
  closeStudioDisplay: () => ipcRenderer.invoke('studio:close-display'),
  getOpenStudioDisplays: () => ipcRenderer.invoke('studio:get-open-displays') as Promise<number[]>,
  closeStudioDisplays: (displayIds?: number[]) => ipcRenderer.invoke('studio:close-displays', displayIds) as Promise<boolean>,
  onStudioDisplaysChanged: (callback: (openDisplayIds: number[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ids: number[]) => callback(ids);
    ipcRenderer.on('studio:displays-changed', listener);
    return () => ipcRenderer.removeListener('studio:displays-changed', listener);
  },
  setPresentationFullscreen: (enabled: boolean) =>
    ipcRenderer.invoke('presentation:set-fullscreen', enabled),
  renderPowerPointSlides: (file: File) =>
    ipcRenderer.invoke('presentation:render-pptx', webUtils.getPathForFile(file)) as Promise<{
      ok: boolean;
      message?: string;
      slides?: { name: string; data: string }[];
    }>,
  optimizeVideo: (file: File) =>
    ipcRenderer.invoke('media:optimize-video', webUtils.getPathForFile(file)) as Promise<{
      ok: boolean;
      optimized?: boolean;
      originalBytes?: number;
      optimizedBytes?: number;
      data?: Uint8Array;
      message?: string;
    }>,
  saveTextFile: (suggestedName: string, content: string, kind: 'backup' | 'songbook') =>
    ipcRenderer.invoke('files:save-text', suggestedName, content, kind) as Promise<{ ok: boolean; canceled?: boolean; filePath?: string; message?: string }>,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  setAuthenticatedMode: (authenticated: boolean) => ipcRenderer.invoke('window:set-authenticated-mode', authenticated),
  startStream: (options: {
    serverUrl: string;
    streamKey: string;
    width: number;
    height: number;
    frameRate: number;
    bitrate: number;
  }) => ipcRenderer.invoke('stream:start', options),
  sendStreamVideoFrame: (frame: ArrayBuffer) => ipcRenderer.send('stream:video-frame', new Uint8Array(frame)),
  sendStreamAudio: (chunk: ArrayBuffer) => ipcRenderer.send('stream:audio', new Uint8Array(chunk)),
  stopStream: () => ipcRenderer.invoke('stream:stop'),
  startRecording: (options: { capture: { x: number; y: number; width: number; height: number } }) => ipcRenderer.invoke('recording:start', options),
  sendRecordingAudio: (chunk: ArrayBuffer) => ipcRenderer.send('recording:audio', chunk),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  onRecordingStatus: (callback: (event: RecordingStatusEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: RecordingStatusEvent) => callback(payload);
    ipcRenderer.on('recording:status', listener);
    return () => ipcRenderer.removeListener('recording:status', listener);
  },
  onStreamStatus: (callback: (event: StreamStatusEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: StreamStatusEvent) => callback(payload);
    ipcRenderer.on('stream:status', listener);
    return () => ipcRenderer.removeListener('stream:status', listener);
  },
});
