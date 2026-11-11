/** Renderer ↔ main-process lifecycle messages for streaming and recording. */
export type StreamStatus = 'connecting' | 'live' | 'stopping' | 'stopped' | 'error';
export type StreamStatusEvent = { status: StreamStatus; message?: string };

export type RecordingStatus = 'saved' | 'error';
export type RecordingStatusEvent = { status: RecordingStatus; message?: string; filePath?: string };
