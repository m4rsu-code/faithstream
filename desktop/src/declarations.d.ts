/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
interface Window {
  faithstreamWindow?: {
    getStudioDisplays: () => Promise<{ id: number; name: string; primary: boolean; bounds: { x: number; y: number; width: number; height: number } }[]>;
    openStudioDisplay: (displayId: number) => Promise<{ ok: boolean; message?: string }>;
    closeStudioDisplay: () => Promise<boolean>;
    setPresentationFullscreen: (enabled: boolean) => Promise<boolean>;
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
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
