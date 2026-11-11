export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';
export const TOKEN_KEY = 'faithstream_admin_token';
export const USER_KEY = 'faithstream_admin_user';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function requestApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
  });
  const data: unknown = await response.json().catch(() => ({}));
  const message = typeof data === 'object' && data !== null && 'message' in data
    ? String(data.message)
    : `Request failed (${response.status}).`;

  if (!response.ok) {
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export async function requestApiBlob(path: string): Promise<Blob> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'image/*', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: 'no-store',
  });
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => ({}));
    const message = typeof data === 'object' && data !== null && 'message' in data
      ? String(data.message)
      : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return response.blob();
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'Failed to fetch') {
    return `Cannot reach the FaithStream Studio API at ${API_BASE}. Start the backend and try again.`;
  }

  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
