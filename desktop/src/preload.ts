import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('faithstreamWindow', {
  getStudioDisplays: () => ipcRenderer.invoke('studio:get-displays'),
  openStudioDisplay: (displayId: number) => ipcRenderer.invoke('studio:open-display', displayId),
  closeStudioDisplay: () => ipcRenderer.invoke('studio:close-display'),
  setPresentationFullscreen: (enabled: boolean) =>
    ipcRenderer.invoke('presentation:set-fullscreen', enabled),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
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
  onStreamStatus: (callback: (event: { status: string; message?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { status: string; message?: string }) => callback(payload);
    ipcRenderer.on('stream:status', listener);
    return () => ipcRenderer.removeListener('stream:status', listener);
  },
});
