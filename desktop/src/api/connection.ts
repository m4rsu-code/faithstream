import { apiFetch } from './client';

export type BackendConnectionStatus = 'connected' | 'database-unavailable' | 'unreachable';

type ConnectionResponse = {
  ok?: boolean;
  services?: { api?: string; database?: string };
};

/** Check that the Laravel API responds and can reach its configured database. */
export const checkBackendConnection = async (signal?: AbortSignal): Promise<BackendConnectionStatus> => {
  try {
    const response = await apiFetch('connection-check', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
    const result = await response.json().catch(() => ({})) as ConnectionResponse;

    if (response.ok && result.ok && result.services?.database === 'connected') return 'connected';
    if (result.services?.api === 'connected' && result.services.database === 'disconnected') return 'database-unavailable';
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
};
