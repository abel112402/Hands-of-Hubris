import { defineConfig } from 'vite'

/**
 * Builds the engine export CLI for Node (npm run export:engine): the same core code the app runs, bundled so Node can
 * load it without a TypeScript loader. Dependencies stay in node_modules.
 */
export default defineConfig({
  logLevel: 'warn',
  build: {
    ssr: 'scripts/engineCliMain.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'engine-cli.mjs', format: 'es' } },
  },
})
