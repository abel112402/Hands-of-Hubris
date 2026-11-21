import { describe, expect, it } from 'vitest'
import { ENGINE_FORMAT, ENGINE_FORMAT_VERSION } from '../src/core/engine/manifest'
import { REPORT_FORMAT, REPORT_VERSION, reportSchema } from '../src/core/engine/report'
import { MANIFEST, REPORT_FILE } from '../src/core/engine/folder'

/**
 * The Godot addon is GDScript and runs only inside Godot; these checks keep it in step with the planner's formats
 * (format names and versions, the report's fields) and catch broken file references without a Godot install.
 */
const fs = (await import('node:fs' as string)) as { readFileSync(p: string, e: string): string; readdirSync(p: string): string[]; existsSync(p: string): boolean }
const DIR = 'engine-packages/godot/addons/hoh_planner'
const scripts = fs.readdirSync(DIR).filter((f) => f.endsWith('.gd'))
const read = (f: string) => fs.readFileSync(`${DIR}/${f}`, 'utf8')

describe('Godot planner addon', () => {
  it('is an enabled-able plugin whose script exists', () => {
    const cfg = read('plugin.cfg')
    expect(cfg).toMatch(/^\[plugin\]/)
    const script = /script="([^"]+)"/.exec(cfg)![1]
    expect(fs.existsSync(`${DIR}/${script}`)).toBe(true)
    expect(read(script)).toMatch(/^@tool\nextends EditorPlugin/m)
  })

  it('preloads only files that exist and indents with tabs', () => {
    for (const f of scripts) {
      const text = read(f)
      for (const m of text.matchAll(/preload\("([^"]+)"\)/g)) expect(fs.existsSync(`${DIR}/${m[1]}`), `${f}: ${m[1]}`).toBe(true)
      for (const m of text.matchAll(/"res:\/\/addons\/hoh_planner\/([^"]+)"/g)) expect(fs.existsSync(`${DIR}/${m[1]}`), `${f}: ${m[1]}`).toBe(true)
      expect(text, f).not.toMatch(/^ +\S/m)
      // Blocks open with a colon; a missing one is the commonest slip when GDScript cannot be run here.
      for (const line of text.split('\n')) if (/^\s*(func|static func|if|elif|else|for|while|match)\b/.test(line) && !/^\s*#/.test(line)) expect(line.trimEnd(), `${f}: ${line}`).toMatch(/:(\s*#.*)?$|:\s*\S/)
    }
  })

  it('reads the export format the planner writes and writes the report it reads', () => {
    const bundle = read('planner_bundle.gd')
    expect(bundle).toContain(`const FORMAT := "${ENGINE_FORMAT}"`)
    expect(bundle).toContain(`const FORMAT_VERSION := ${ENGINE_FORMAT_VERSION}`)
    expect(bundle).toContain(`const MANIFEST := "${MANIFEST}"`)
    expect(bundle).toContain(`const REPORT := "${REPORT_FILE}"`)
    const report = read('planner_report.gd')
    expect(report).toContain(`"format": "${REPORT_FORMAT}"`)
    expect(report).toContain(`"v": ${REPORT_VERSION}`)
    expect(report).toContain('"engine": "godot"')
    for (const key of Object.keys(reportSchema.shape)) expect(report, key).toContain(`"${key}":`)
    for (const key of ['plannerId', 'schema', 'key', 'status', 'assetPath', 'issues']) expect(report).toContain(`"${key}"`)
    for (const key of ['name', 'file', 'todo', 'methods']) expect(report).toContain(`"${key}"`)
  })

  it('uses the planner’s marker for unfinished methods', () => {
    expect(read('planner_report.gd')).toContain('const TODO := "# TODO"')
  })
})
