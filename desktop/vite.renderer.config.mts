import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const DEFAULT_API_URL = 'http://127.0.0.1:8000/api';

/**
 * Adds a Content Security Policy to the packaged renderer. It blocks injected
 * scripts, eval and plugins, so a malicious slide, song text or API response
 * cannot run code inside the app. Only applied to builds: the Vite dev server
 * relies on inline scripts for hot reload.
 */
const contentSecurityPolicy = (apiUrl: string): Plugin => {
  let apiOrigin = '';
  try { apiOrigin = new URL(apiUrl).origin; } catch { /* fall back to 'self' only */ }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: https: ${apiOrigin}`.trim(),
    `media-src 'self' data: blob: https: ${apiOrigin}`.trim(),
    // https: is allowed so Studio can embed remote slide images into the stream output.
    `connect-src 'self' data: blob: https: ${apiOrigin} ws://127.0.0.1:*`.replace(/\s+/g, ' ').trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'faithstream-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
      react(),
      tailwindcss(),
      contentSecurityPolicy(env.VITE_FAITHSTREAM_API_URL || DEFAULT_API_URL),
    ],
  };
});
