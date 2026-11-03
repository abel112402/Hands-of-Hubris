/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Keep in sync with ALLOWED_HOSTS in src/core/ai/security.ts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

// Applied to production builds only so the dev server's HMR websocket keeps working.
const cspPlugin = (): Plugin => ({
  name: 'hohplan-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
})

export default defineConfig({
  plugins: [react(), cspPlugin()],
  base: './',
  // The AI docs search embeds ../docs at build time.
  server: { fs: { allow: ['..'] } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts?(x)'] },
})
