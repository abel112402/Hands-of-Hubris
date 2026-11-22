import { deserializeProject } from '../src/core/persistence/serialize'
import { buildBundle, bundleZip } from '../src/core/engine/bundle'
import { describeWrite, previewExport, restoreLastWrite, writeExport } from '../src/core/engine/folder'
import { describePlan } from '../src/core/engine/ownership'
import { ENGINE_TARGETS, engineTarget } from '../src/core/engine/target'
import type { EngineId } from '../src/core/engine/adapter'
import { nodeFolder, type NodeFs } from './nodeFolder'

export const USAGE = `Usage: npm run export:engine -- <plan.hohplan.json> <output> [options]

Writes the engine export of a planner project, the same as Engine export in the app.
  <output> ending in .zip   the zip the app downloads
  <output> a folder         the files themselves, with the linked-folder rules: unchanged files are left alone,
                            your class files (Unity/Scripts/Classes, Godot/Scripts/Classes, Unreal/Source/PlannerGame) are only created when
                            missing, and generated files the plan dropped are deleted (only in a folder that already
                            holds an export). A file changed since the last export (or not written by the planner)
                            stops the write before anything is written; with --overwrite it is backed up under
                            .hoh-backup/ and replaced. For Unity, point it at Assets/HoHPlanner and let the bridge package
                            finish the import; for Godot at res://HoHPlanner, with the planner addon; for
                            Unreal at Plugins/HoHPlanner, with the bridge plugin.

Options:
  --engine unity|godot|unreal   target engine (default: the project's)
  --exported-at <ISO time>      fixed export time, for byte-identical output
  --strict                      exit 1 when the export has errors (not warnings)
  --preview                     folder output: list what would change, write nothing
  --overwrite                   folder output: overwrite conflicting files (a backup is kept)
  --restore                     folder output: undo the last write from its backup (give only the folder)

Exit codes: 0 done, 1 errors with --strict, 2 bad arguments or project file, 3 stopped on conflicts (folder output).`

export type CliIo = { fs: NodeFs; log(line: string): void; error(line: string): void }

/** Runs the CLI with arguments (without node and the script). Returns the exit code; never throws. */
export async function runCli(args: string[], io: CliIo): Promise<number> {
  const opts: Record<string, string | boolean> = {}
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--help' || a === '-h') {
      io.log(USAGE)
      return 0
    }
    if (a === '--strict' || a === '--preview' || a === '--overwrite' || a === '--restore') opts[a.slice(2)] = true
    else if (a === '--engine' || a === '--exported-at') {
      const v = args[++i]
      if (!v) return fail(io, `${a} needs a value.`)
      opts[a.slice(2)] = v
    } else if (a.startsWith('--')) return fail(io, `Unknown option ${a}.`)
    else positional.push(a)
  }
  if (opts.restore) {
    if (positional.length !== 1 || !io.fs.existsSync(positional[0])) return fail(io, 'With --restore, give only the output folder.')
    io.log(await restoreLastWrite(nodeFolder(io.fs, positional[0])))
    return 0
  }
  if (positional.length !== 2) return fail(io, 'Give the project file and the output.')
  const [input, output] = positional
  if (!io.fs.existsSync(input)) return fail(io, `No such file: ${input}`)
  let project
  try {
    const loaded = deserializeProject(io.fs.readFileSync(input, 'utf8'))
    project = loaded.project
    for (const w of loaded.warnings) io.error(`warning: ${w}`)
  } catch (e) {
    return fail(io, `${input}: ${(e as Error).message}`)
  }
  const engine = (opts.engine as string | undefined) ?? engineTarget(project).id
  if (!ENGINE_TARGETS.some((t) => t.id === engine)) return fail(io, `Unknown engine “${engine}”; use ${ENGINE_TARGETS.map((t) => t.id).join(', ')}.`)
  const bundle = buildBundle(project, engine as EngineId, (opts['exported-at'] as string | undefined) ?? new Date().toISOString())
  const errors = bundle.issues.filter((i) => i.level === 'error')
  const warnings = bundle.issues.filter((i) => i.level === 'warning')
  for (const i of [...errors, ...warnings]) io.error(`${i.level}: ${i.message}`)
  try {
    if (/\.zip$/i.test(output)) {
      const blob = await bundleZip(bundle)
      io.fs.writeFileSync(output, new Uint8Array(await blob.arrayBuffer()))
      io.log(`${project.meta.name} → ${output}: ${bundle.files.length} files for ${engine}.`)
    } else {
      io.fs.mkdirSync(output, { recursive: true })
      if (opts.preview) {
        const plan = await previewExport(nodeFolder(io.fs, output), bundle.files)
        io.log(`${project.meta.name} → ${output} (${engine}), preview: ${describePlan(plan)}.`)
        for (const e of plan.entries.filter((x) => x.action !== 'unchanged')) io.log(`  ${e.action.padEnd(11)} ${e.path}${e.reason ? ` (${e.reason})` : ''}`)
        return plan.conflicts.length ? 3 : 0
      }
      const r = await writeExport(nodeFolder(io.fs, output), bundle.files, { overwrite: !!opts.overwrite })
      io.log(`${project.meta.name} → ${output} (${engine}): ${describeWrite(r)}.`)
      if (r.stopped) return 3
    }
  } catch (e) {
    return fail(io, `Could not write ${output}: ${(e as Error).message}`)
  }
  io.log(`${bundle.manifest.counts.records} records, ${errors.length} error(s), ${warnings.length} warning(s).`)
  return opts.strict && errors.length ? 1 : 0
}

function fail(io: CliIo, message: string): number {
  io.error(message)
  io.error('Run with --help for the usage.')
  return 2
}
