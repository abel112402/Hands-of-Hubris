import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { MODULES, getSections } from '../src/core/modules/registry'
import { validateProject } from '../src/core/references/refs'
import { tryEvaluate } from '../src/core/formula'
import { moduleToMarkdown } from '../src/core/export/markdown'
import type { SectionDef } from '../src/core/model/types'

// Read from disk (Vitest runs from the app root). Dynamic import with a string specifier because the project has no Node type definitions.
const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
const text = fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')

/** True when a section holds real content, by its kind. */
function filled(sec: SectionDef, data: any): boolean {
  switch (sec.kind) {
    case 'form':
      return !!data && Object.values(data).some((v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
    case 'collection':
      return Array.isArray(data) && data.length > 0
    case 'matrix':
      return Object.keys(data?.cells ?? {}).length > 0
    case 'graph':
      return (data?.nodes?.length ?? 0) > 0
    case 'canvas':
      return (data?.items?.length ?? 0) > 0
    case 'checklist':
      return (data?.groups ?? []).some((g: any) => g.items?.length)
    case 'formulas':
      return (data?.items?.length ?? 0) > 0
    case 'richtext':
      return typeof data === 'string' && data.trim().length > 0
  }
}

describe('examples/cinderholm.hohplan.json', () => {
  const { project, warnings } = deserializeProject(text)

  it('loads through the import path without warnings', () => {
    expect(warnings).toEqual([])
    expect(project.meta.name).toBe('Cinderholm (example)')
  })

  it('fills every planner and every section', () => {
    // Opt-in sections the example leaves empty on purpose. Playable prototype: filling it would add prototype checks to
    // every Cinderholm export; tests/fixtures/referenceSlice3d.ts covers it (plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md).
    const OPT_IN = new Set(['technical.architecture/prototype'])
    const empty: string[] = []
    for (const m of MODULES) {
      const doc = project.documents[m.id]
      if (!doc) {
        empty.push(m.id)
        continue
      }
      for (const sec of getSections(m, project.registry)) if (!OPT_IN.has(`${m.id}/${sec.id}`) && !filled(sec, doc.data[sec.id])) empty.push(`${m.id}/${sec.id}`)
    }
    expect(empty).toEqual([])
  })

  it('has no broken references, duplicates or cycles', () => {
    expect(validateProject(project)).toEqual([])
  })

  it('has formulas that evaluate', () => {
    const bad: string[] = []
    for (const m of MODULES)
      for (const sec of getSections(m, project.registry))
        if (sec.kind === 'formulas')
          for (const f of project.documents[m.id].data[sec.id].items) if (!tryEvaluate(f.expr, f.vars).ok) bad.push(`${m.id}: ${f.name}`)
    expect(bad).toEqual([])
  })

  it('exports every planner to Markdown', () => {
    for (const m of MODULES) expect(moduleToMarkdown(project, m).length).toBeGreaterThan(0)
  })
})
