const DEFAULT_API_URL = 'http://127.0.0.1:8000/api';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const env = (import.meta as ImportMeta & { env: { VITE_FAITHSTREAM_API_URL?: string; VITE_FAITHSTREAM_ALLOW_LAN_HTTP?: string } }).env;

const isPrivateLanAddress = (hostname: string) => {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second] = octets;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
};

/**
 * The FaithStream Studio API base URL, without a trailing slash.
 *
 * Passwords and sign-in tokens travel to this address, so plain http:// is only
 * accepted for this computer. Private-LAN HTTP is allowed only when explicitly
 * enabled for a trusted local network; all other remote HTTP is upgraded to HTTPS.
 */
const resolveApiBaseUrl = () => {
  const configured = (env.VITE_FAITHSTREAM_API_URL ?? DEFAULT_API_URL).trim() || DEFAULT_API_URL;
  try {
    const url = new URL(configured);
    if (url.username || url.password || url.search || url.hash) return DEFAULT_API_URL;
    const allowLanHttp = env.VITE_FAITHSTREAM_ALLOW_LAN_HTTP?.trim().toLowerCase() === 'true';
    const isAllowedLanHttp = allowLanHttp && url.protocol === 'http:' && isPrivateLanAddress(url.hostname);
    if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname) && !isAllowedLanHttp) url.protocol = 'https:';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_API_URL;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_API_URL;
  }
};

export const API_BASE_URL = resolveApiBaseUrl();
