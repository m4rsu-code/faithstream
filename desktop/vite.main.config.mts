import { defineConfig, loadEnv } from 'vite';

const DEFAULT_API_URL = 'http://127.0.0.1:8000/api';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const isPrivateLanAddress = (hostname: string) => {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 169 && octets[1] === 254);
};

const resolveApiUrl = (configured: string, allowInsecureLanHttp: boolean) => {
  try {
    const url = new URL(configured.trim() || DEFAULT_API_URL);
    const allowedLanHttp = allowInsecureLanHttp && isPrivateLanAddress(url.hostname);
    if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname) && !allowedLanHttp) url.protocol = 'https:';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_API_URL;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_API_URL;
  }
};

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      __FAITHSTREAM_UPDATE_FEED_URL__: JSON.stringify(env.FAITHSTREAM_UPDATE_FEED_URL ?? ''),
      __FAITHSTREAM_API_URL__: JSON.stringify(resolveApiUrl(
        env.VITE_FAITHSTREAM_API_URL ?? DEFAULT_API_URL,
        env.VITE_FAITHSTREAM_ALLOW_INSECURE_LAN_HTTP === 'true',
      )),
    },
    build: {
      rollupOptions: {
        external: ['ffmpeg-static'],
      },
    },
  };
});
