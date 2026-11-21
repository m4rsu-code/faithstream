export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'not-configured'
  | 'error';

export type UpdateStatusEvent = {
  status: UpdateStatus;
  message?: string;
};
