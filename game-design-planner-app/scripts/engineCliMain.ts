import { runCli } from './engineCli'
import type { NodeFs } from './nodeFolder'

/** Entry of the engine export CLI (built by vite.cli.config.ts into dist-cli/engine-cli.mjs). */
declare const process: { argv: string[]; exitCode?: number; stdout: { write(s: string): void }; stderr: { write(s: string): void } }

const fs = (await import('node:fs' as string)) as NodeFs
process.exitCode = await runCli(process.argv.slice(2), {
  fs,
  log: (l) => process.stdout.write(l + '\n'),
  error: (l) => process.stderr.write(l + '\n'),
})
