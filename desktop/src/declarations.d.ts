/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
interface Window {
  faithstreamWindow?: {
    getAuthToken: () => Promise<string | null>;
    saveAuthToken: (token: string) => Promise<boolean>;
    clearAuthToken: () => Promise<boolean>;
    getStudioDisplays: () => Promise<{ id: number; name: string; primary: boolean; bounds: { x: number; y: number; width: number; height: number } }[]>;
    openStudioDisplay: (displayId: number) => Promise<{ ok: boolean; message?: string }>;
    closeStudioDisplay: () => Promise<boolean>;
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
      capture: { x: number; y: number; width: number; height: number };
    }) => Promise<{ ok: boolean; message?: string }>;
    sendStreamAudio: (chunk: ArrayBuffer) => void;
    stopStream: () => Promise<boolean>;
    startRecording: (options: { capture: { x: number; y: number; width: number; height: number } }) => Promise<{ ok: boolean; canceled?: boolean; message?: string; filePath?: string }>;
    sendRecordingAudio: (chunk: ArrayBuffer) => void;
    stopRecording: () => Promise<boolean>;
    onRecordingStatus: (callback: (event: { status: string; message?: string; filePath?: string }) => void) => () => void;
    onStreamStatus: (callback: (event: { status: string; message?: string }) => void) => () => void;
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
