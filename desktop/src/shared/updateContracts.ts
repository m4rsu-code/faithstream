export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'not-configured'
  | 'error';

export type UpdateStatusEvent = {
  status: UpdateStatus;
  message?: string;
};
