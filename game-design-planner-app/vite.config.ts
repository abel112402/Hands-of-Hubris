/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const TURNSTILE = 'https://challenges.cloudflare.com'

/**
 * Production CSP. AI hosts: keep in sync with ALLOWED_HOSTS in src/core/ai/security.ts.
 * The cloud backend (and Turnstile) are allowed only when this build is configured for them.
 */
function buildCsp(env: Record<string, string>) {
  if (env.VITE_SUPABASE_URL && !URL.canParse(env.VITE_SUPABASE_URL))
    throw new Error(`VITE_SUPABASE_URL is not a valid URL: ${env.VITE_SUPABASE_URL}`)
  const backend = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : ''
  const turnstile = env.VITE_TURNSTILE_SITE_KEY ? TURNSTILE : ''
  return [
    "default-src 'self'",
    `script-src 'self' ${turnstile}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com ${backend}`.trim(),
    `frame-src ${turnstile || "'none'"}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

// Applied to production builds only so the dev server's HMR websocket keeps working.
const cspPlugin = (csp: string): Plugin => ({
  name: 'hohplan-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), cspPlugin(buildCsp(loadEnv(mode, '.', 'VITE_')))],
  base: './',
  // The AI docs search embeds ../docs at build time.
  server: { fs: { allow: ['..'] } },
  // UI tests render the whole app; under a full parallel run the first render of a file can pass 5 s.
  // tests/cloud needs the local Supabase stack: run it with `npm run test:cloud`.
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts?(x)'], exclude: ['tests/cloud/**', 'node_modules/**'], testTimeout: 15000 },
}))
