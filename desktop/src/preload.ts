import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('faithstreamWindow', {
  getAuthToken: () => ipcRenderer.invoke('auth:token:get') as Promise<string | null>,
  saveAuthToken: (token: string) => ipcRenderer.invoke('auth:token:set', token) as Promise<boolean>,
  clearAuthToken: () => ipcRenderer.invoke('auth:token:clear') as Promise<boolean>,
  getStudioDisplays: () => ipcRenderer.invoke('studio:get-displays'),
  openStudioDisplay: (displayId: number) => ipcRenderer.invoke('studio:open-display', displayId),
  closeStudioDisplay: () => ipcRenderer.invoke('studio:close-display'),
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
    capture: { x: number; y: number; width: number; height: number };
  }) => ipcRenderer.invoke('stream:start', options),
  sendStreamAudio: (chunk: ArrayBuffer) => ipcRenderer.send('stream:audio', chunk),
  stopStream: () => ipcRenderer.invoke('stream:stop'),
  startRecording: (options: { capture: { x: number; y: number; width: number; height: number } }) => ipcRenderer.invoke('recording:start', options),
  sendRecordingAudio: (chunk: ArrayBuffer) => ipcRenderer.send('recording:audio', chunk),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  onRecordingStatus: (callback: (event: { status: string; message?: string; filePath?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { status: string; message?: string; filePath?: string }) => callback(payload);
    ipcRenderer.on('recording:status', listener);
    return () => ipcRenderer.removeListener('recording:status', listener);
  },
  onStreamStatus: (callback: (event: { status: string; message?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { status: string; message?: string }) => callback(payload);
    ipcRenderer.on('stream:status', listener);
    return () => ipcRenderer.removeListener('stream:status', listener);
  },
});
