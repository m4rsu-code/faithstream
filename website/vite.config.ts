import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const websiteRoot = fileURLToPath(new URL('.', import.meta.url))
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
const fallbackApiBase = 'http://127.0.0.1:8000/api'

function resolveApiBase(rawValue: string | undefined, isBuild: boolean): string {
  const value = rawValue?.trim() ?? ''
  if (!isBuild && !value) return fallbackApiBase
  if (isBuild && !value) {
    throw new Error('VITE_API_BASE_URL is not set. Set it to the public HTTPS API URL before building the website.')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('VITE_API_BASE_URL must be an absolute URL.')
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_BASE_URL must not contain credentials, a query, or a fragment. Keep private keys in the server environment, never a frontend build variable.')
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopbackHosts.has(url.hostname))) {
    throw new Error('VITE_API_BASE_URL must use HTTPS for non-local servers.')
  }

  return value.replace(/\/+$/, '')
}

function securityHeaders(apiOrigin: string, isDev: boolean): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
      `connect-src 'self' ${apiOrigin}${isDev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    ].join('; '),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  }
}

function websiteSecurityHeaders(headers: Record<string, string>) {
  let outputDirectory = ''
  const applyHeaders = (_request: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value)
    next()
  }

  return {
    name: 'faithstream-website-security-headers',
    configResolved(config: { root: string; build: { outDir: string } }) {
      outputDirectory = resolve(config.root, config.build.outDir)
    },
    transformIndexHtml: {
      order: 'pre' as const,
      handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: headers['Content-Security-Policy'] }, injectTo: 'head-prepend' as const }],
    },
    configureServer(server: { middlewares: { use: (middleware: typeof applyHeaders) => void } }) {
      server.middlewares.use(applyHeaders)
    },
    configurePreviewServer(server: { middlewares: { use: (middleware: typeof applyHeaders) => void } }) {
      server.middlewares.use(applyHeaders)
    },
    closeBundle() {
      if (!outputDirectory) return
      const lines = ['/*', ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`), '']
      writeFileSync(join(outputDirectory, '_headers'), `${lines.join('\n')}\n`, 'utf8')
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, websiteRoot, '')
  const apiBase = resolveApiBase(env.VITE_API_BASE_URL ?? process.env.VITE_API_BASE_URL, command === 'build')
  const apiOrigin = new URL(apiBase).origin
  const headers = securityHeaders(apiOrigin, command === 'serve')

  return {
    plugins: [react(), tailwindcss(), websiteSecurityHeaders(headers)],
  }
})
