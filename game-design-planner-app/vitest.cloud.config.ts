/// <reference types="vitest/config" />
// Integration tests against the local Supabase stack (`npm run test:cloud`).
// Requires `npx supabase start` and .env.cloudtest.local (values from `npx supabase status`).
import { defineConfig, loadEnv } from 'vite'

export default defineConfig({
  test: {
    include: ['tests/cloud/**/*.test.ts'],
    environment: 'node',
    env: loadEnv('cloudtest', '.', 'SUPABASE_'),
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
})
