import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const adminRoot = fileURLToPath(new URL('.', import.meta.url));
const desktopLogo = resolve(adminRoot, '../desktop/src/assets/img/Logo.png');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const FALLBACK_API_BASE = 'http://127.0.0.1:8000/api';

/**
 * Resolve the API base URL, refusing to build an admin console that cannot
 * reach its own API or that would send an administrator's bearer token over
 * plain HTTP to a remote host.
 */
function resolveApiBase(rawValue, isBuild) {
  const value = String(rawValue ?? '').trim();

  if (!isBuild) {
    return value || FALLBACK_API_BASE;
  }

  if (!value) {
    throw new Error(
      'VITE_API_BASE_URL is not set. Set it (for example in admin/.env.production) to the public API URL, such as https://api.example.com/api, before building the admin console.',
    );
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`VITE_API_BASE_URL must be an absolute URL. Received "${value}".`);
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) {
    throw new Error(
      `VITE_API_BASE_URL must use https:// for any non-local host because administrator tokens are sent with every request. Received "${value}".`,
    );
  }

  return value.replace(/\/+$/, '');
}

function apiOriginOf(apiBase) {
  try {
    return new URL(apiBase).origin;
  } catch {
    return null;
  }
}

function securityHeaders({ apiOrigin, isDev }) {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    'frame-ancestors \'none\'',
    "form-action 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    // Tailwind and the chart bars inject style tags and inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    isDev
      // The Vite client and React refresh preamble are inline scripts in dev only.
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self'",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
  ];

  return {
    'Content-Security-Policy': directives.join('; '),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
}

/**
 * The admin console is a static SPA, so its headers have to come from whatever
 * serves it. This plugin applies them to the dev and preview servers, writes the
 * policy into the built index.html, and emits a `_headers` file (understood by
 * Netlify and Cloudflare Pages) for the built artifact. Other hosts must be
 * configured to send the same headers.
 */
function adminSecurityHeaders({ apiOrigin, isDev }) {
  const headers = securityHeaders({ apiOrigin, isDev });
  let outDir = '';

  const applyHeaders = (_request, response, next) => {
    for (const [name, value] of Object.entries(headers)) {
      response.setHeader(name, value);
    }
    next();
  };

  return {
    name: 'faithstream-admin-security-headers',

    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },

    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: headers['Content-Security-Policy'] },
          injectTo: 'head-prepend',
        },
      ],
    },

    configureServer(server) {
      server.middlewares.use(applyHeaders);
    },

    configurePreviewServer(server) {
      server.middlewares.use(applyHeaders);
    },

    closeBundle() {
      if (!outDir) return;
      const lines = ['/*', ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`), ''];
      writeFileSync(join(outDir, '_headers'), `${lines.join('\n')}\n`, 'utf8');
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const isBuild = command === 'build';
  const isDev = command === 'serve';
  const env = loadEnv(mode, adminRoot, '');
  const apiBase = resolveApiBase(env.VITE_API_BASE_URL ?? process.env.VITE_API_BASE_URL, isBuild);
  const apiOrigin = apiOriginOf(apiBase);

  return {
    plugins: [tailwindcss(), react(), adminSecurityHeaders({ apiOrigin, isDev })],
    server: {
      fs: {
        allow: [adminRoot, desktopLogo],
      },
    },
  };
});
