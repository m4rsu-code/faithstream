const DEFAULT_API_URL = 'http://127.0.0.1:8000/api';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const env = (import.meta as ImportMeta & { env: { VITE_FAITHSTREAM_API_URL?: string; VITE_FAITHSTREAM_ALLOW_INSECURE_LAN_HTTP?: string } }).env;

const isPrivateLanAddress = (hostname: string) => {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 169 && octets[1] === 254);
};

/**
 * The FaithStream Studio API base URL, without a trailing slash.
 *
 * Passwords and sign-in tokens travel to this address, so plain http:// is only
 * accepted for this computer, unless the developer explicitly opts into HTTP on a
 * private LAN for local testing. Any other remote http:// address is upgraded to https.
 */
const resolveApiBaseUrl = () => {
  const configured = (env.VITE_FAITHSTREAM_API_URL ?? DEFAULT_API_URL).trim() || DEFAULT_API_URL;
  try {
    const url = new URL(configured);
    const insecureLanEnabled = env.VITE_FAITHSTREAM_ALLOW_INSECURE_LAN_HTTP === 'true';
    const allowedLanHttp = insecureLanEnabled && isPrivateLanAddress(url.hostname);
    if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname) && !allowedLanHttp) url.protocol = 'https:';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_API_URL;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_API_URL;
  }
};

export const API_BASE_URL = resolveApiBaseUrl();
