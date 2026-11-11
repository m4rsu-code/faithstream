const DEFAULT_API_URL = 'http://127.0.0.1:8000/api';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const env = (import.meta as ImportMeta & { env: { VITE_FAITHSTREAM_API_URL?: string } }).env;

/**
 * The FaithStream Studio API base URL, without a trailing slash.
 *
 * Passwords and sign-in tokens travel to this address, so plain http:// is only
 * accepted for a backend running on this same computer. Any other http:// address
 * is upgraded to https:// so credentials are never sent unencrypted over a network.
 */
const resolveApiBaseUrl = () => {
  const configured = (env.VITE_FAITHSTREAM_API_URL ?? DEFAULT_API_URL).trim() || DEFAULT_API_URL;
  try {
    const url = new URL(configured);
    if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) url.protocol = 'https:';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_API_URL;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_API_URL;
  }
};

export const API_BASE_URL = resolveApiBaseUrl();
