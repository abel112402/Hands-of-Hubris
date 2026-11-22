import { defineConfig } from 'vite'

/**
 * Builds the Unity gate for Node (npm run gate:unity, scripts/unityGate.ts): exports the reference plan with the same
 * core code as the app and the CLI, then drives Unity. Dependencies stay in node_modules.
 */
export default defineConfig({
  logLevel: 'warn',
  build: {
    ssr: 'scripts/unityGateMain.ts',
    outDir: 'dist-gate',
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'unity-gate.mjs', format: 'es' } },
  },
})
