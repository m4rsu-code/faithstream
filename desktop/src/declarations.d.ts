/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
interface Window {
  faithstreamWindow?: {
    getAuthToken: () => Promise<string | null>;
    getStreamSettings: () => Promise<{ serverUrl: string; streamKey: string } | null>;
    saveStreamSettings: (settings: { serverUrl: string; streamKey: string }) => Promise<boolean>;
    saveAuthToken: (token: string) => Promise<boolean>;
    clearAuthToken: () => Promise<boolean>;
    openExternalUrl: (url: string) => Promise<boolean>;
    getStudioDisplays: () => Promise<{ id: number; name: string; primary: boolean; bounds: { x: number; y: number; width: number; height: number } }[]>;
    registerStudioMusicFile: (file: File) => Promise<{ ok: boolean; asset?: { id: string; name: string; path: string; url: string }; message?: string }>;
    resolveStudioMusicFiles: (assets: { id: string; name: string; path: string; createdAt: number }[]) => Promise<{ id: string; name: string; path: string; createdAt: number; url: string; available: boolean }[]>;
    removeStudioMusicFile: (id: string) => Promise<boolean>;
    startMobileCamPairing: (sourceId: number) => Promise<{ ok: boolean; sourceId?: number; port?: number; code?: string; expiresAt?: number; addresses?: string[]; message?: string }>;
    renewMobileCamPairingCode: (sourceId: number) => Promise<{ ok: boolean; sourceId?: number; code?: string; expiresAt?: number; message?: string }>;
    stopMobileCamPairing: (sourceId: number) => Promise<boolean>;
    openStudioDisplay: (displayId: number) => Promise<{ ok: boolean; message?: string }>;
    closeStudioDisplay: () => Promise<boolean>;
    getOpenStudioDisplays: () => Promise<number[]>;
    closeStudioDisplays: (displayIds?: number[]) => Promise<boolean>;
    onStudioDisplaysChanged: (callback: (openDisplayIds: number[]) => void) => () => void;
    setPresentationFullscreen: (enabled: boolean) => Promise<boolean>;
    renderPowerPointSlides: (file: File) => Promise<{
      ok: boolean;
      message?: string;
      slides?: { name: string; data: string }[];
    }>;
    optimizeVideo: (file: File) => Promise<{
      ok: boolean;
      optimized?: boolean;
      originalBytes?: number;
      optimizedBytes?: number;
      data?: Uint8Array;
      message?: string;
    }>;
    saveTextFile: (suggestedName: string, content: string, kind: 'backup' | 'songbook') => Promise<{ ok: boolean; canceled?: boolean; filePath?: string; message?: string }>;
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
    setAuthenticatedMode: (authenticated: boolean) => Promise<boolean>;
    startStream: (options: {
      serverUrl: string;
      streamKey: string;
      width: number;
      height: number;
      frameRate: number;
      bitrate: number;
    }) => Promise<{ ok: boolean; message?: string }>;
    sendStreamVideoFrame: (frame: ArrayBuffer) => void;
    sendStreamAudio: (chunk: ArrayBuffer) => void;
    stopStream: () => Promise<boolean>;
    startRecording: (options: { capture: { x: number; y: number; width: number; height: number } }) => Promise<{ ok: boolean; canceled?: boolean; message?: string; filePath?: string }>;
    sendRecordingAudio: (chunk: ArrayBuffer) => void;
    stopRecording: () => Promise<boolean>;
    onRecordingStatus: (callback: (event: import('./shared/streamContracts').RecordingStatusEvent) => void) => () => void;
    onStreamStatus: (callback: (event: import('./shared/streamContracts').StreamStatusEvent) => void) => () => void;
  };
}
declare module '*.css';
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.gif' {
  const src: string;
  export default src;
}
