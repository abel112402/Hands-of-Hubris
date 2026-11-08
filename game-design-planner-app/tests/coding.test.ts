import { describe, expect, it } from 'vitest'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { moduleToMarkdown } from '../src/core/export/markdown'
import { createProject, makeId } from '../src/core/model/project'
import { ensureDocument, getModule } from '../src/core/modules/registry'
import {
  ARCH_DOC,
  branchFlow,
  branchRegex,
  checkCommit,
  checkName,
  CODING_DOC,
  enforcementSummary,
  exampleIssues,
  folderTree,
  lfsCoverage,
  matchBranch,
  moduleFolders,
  namespaceCheck,
  words,
} from '../src/core/coding'

const coding = getModule(CODING_DOC)!
type P = ReturnType<typeof createProject>

function project(data: Record<string, unknown> = {}, arch?: Record<string, unknown>) {
  const p = createProject('T', false)
  p.documents[CODING_DOC] = { moduleVersion: 2, data }
  if (arch) p.documents[ARCH_DOC] = { moduleVersion: 2, data: arch }
  return p
}
const ruleIds = (p: P, docId = CODING_DOC) =>
  collectHints(makeContext(p, { docId }))
    .filter((h) => h.ruleId.startsWith('coding.'))
    .map((h) => h.ruleId)
    .sort()

describe('coding standards module v2', () => {
  it('migrates v1 text into notes and checklist items into checks, keeping ids', () => {
    const p = createProject('t', false)
    p.documents[CODING_DOC] = {
      moduleVersion: 1,
      data: {
        standards: { naming: 'PascalCase types', style: '', structure: 'Assets/_Project', git: 'Git flow' },
        review: { groups: [{ id: 'g1', title: 'Performance', items: [{ id: 'i1', text: 'No GC in Update', done: true }] }, { id: 'g2', title: 'Misc', items: [{ id: 'i2', text: 'Readable', done: false }] }] },
      },
    }
    const doc = ensureDocument(p, coding, makeId)
    expect(doc.moduleVersion).toBe(2)
    expect(doc.data.standards.naming).toBeUndefined()
    expect(doc.data.standards.legacyNotes).toBe('Naming conventions: PascalCase types\n\nFolder structure: Assets/_Project\n\nGit workflow: Git flow')
    expect(doc.data.review).toEqual([
      { id: 'i1', name: 'No GC in Update', category: 'Performance', adopted: true },
      { id: 'i2', name: 'Readable', group: 'Misc', adopted: false },
    ])
    for (const s of ['naming', 'folders', 'assetRules', 'branches']) expect(Array.isArray(doc.data[s]), s).toBe(true)
  })

  it('migrates the empty v1 shape of the bundled examples', () => {
    const p = createProject('t', false)
    p.documents[CODING_DOC] = { moduleVersion: 1, data: { standards: {}, review: { groups: [] } } }
    const doc = ensureDocument(p, coding, makeId)
    expect(doc.data.review).toEqual([])
    expect(doc.data.standards.legacyNotes).toBeUndefined()
  })

  it('exports sections in doc-chapter order', () => {
    const md = moduleToMarkdown(createProject('T'), coding)
    const order = ['Principles', 'Naming conventions', 'Code style and analyzers', 'Unity project folder structure', 'Prefab, scene and ScriptableObject rules', 'Git workflow: branches', 'Git workflow: commits, PRs and LFS', 'Code review checklist']
    const at = order.map((h) => md.indexOf(h))
    expect(at.every((x) => x >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('exports the folder tree and a Mermaid branch flow', () => {
    const p = project({
      folders: [{ id: 'a', name: '_Project' }, { id: 'b', name: 'Scripts', parent: 'a', asmdef: true }],
      branches: [{ id: 'm', name: 'main', lifetime: 'Permanent' }, { id: 'f', name: 'feature', from: 'm', mergesInto: ['m'], mergeMethod: 'Squash' }],
    })
    const md = moduleToMarkdown(p, coding)
    expect(md).toContain('Assets/\n  _Project/\n    Scripts/ (.asmdef)\n')
    expect(md).toContain('f["feature"] -->|squash| m["main"]')
  })
})

describe('naming rules', () => {
  const iface = { id: 'r', name: 'Interfaces', target: 'Interface', casing: 'PascalCase', prefix: 'I' }
  it('splits words from any casing', () => {
    expect(words('IDamageable_Variant')).toEqual(['i', 'damageable', 'variant'])
    expect(words('HTTPClient')).toEqual(['http', 'client'])
  })
  it('checks prefix, casing and suffix and suggests a fix', () => {
    expect(checkName(iface, 'IDamageable').pass).toBe(true)
    const bad = checkName(iface, 'damageable')
    expect(bad.pass).toBe(false)
    expect(bad.reasons).toEqual(['must start with “I”', 'should be PascalCase'])
    expect(bad.fix).toBe('IDamageable')
    expect(checkName({ id: 'f', casing: 'camelCase', prefix: '_' }, 'm_Hunger').fix).toBe('_mHunger')
    expect(checkName({ id: 'c', casing: 'UPPER_SNAKE' }, 'maxHunger').fix).toBe('MAX_HUNGER')
    expect(checkName({ id: 's', casing: 'PascalCase', suffix: 'Async' }, 'loadAsync').fix).toBe('LoadAsync')
    expect(checkName(iface, '').pass).toBeNull()
  })
  it('allows dotted namespaces and custom patterns', () => {
    const ns = { id: 'n', target: 'Namespace', casing: 'PascalCase', prefix: 'HoH.' }
    expect(checkName(ns, 'HoH.Simulation.Npc').pass).toBe(true)
    expect(checkName(ns, 'HoH.simulation').pass).toBe(false)
    expect(checkName({ id: 't', pattern: '^T_[A-Z]\\w*_(D|N)$' }, 'T_Wall_N').pass).toBe(true)
    expect(checkName({ id: 't', pattern: '(' }, 'x').pass).toBeNull()
  })
  it('finds rules contradicting their examples and assemblies breaking the namespace rule', () => {
    const p = project(
      {
        naming: [
          { ...iface, example: 'Damageable' },
          { id: 'ok', casing: 'camelCase', example: 'amount', counterExample: 'speed' },
          { id: 'ns', target: 'Namespace', casing: 'PascalCase', prefix: 'HoH.' },
        ],
      },
      { modules: [{ id: 'm1', name: 'Core', assembly: 'HoH.Core' }, { id: 'm2', name: 'Ui', assembly: 'hoh.ui' }, { id: 'm3', name: 'No asm' }] },
    )
    expect(exampleIssues(p).map((i) => `${i.rule.id}:${i.problem}`)).toEqual(['r:example', 'ok:counterExample'])
    expect(namespaceCheck(p).rows.map((r) => `${r.assembly}:${r.check.pass}`)).toEqual(['HoH.Core:true', 'hoh.ui:false'])
  })
})

describe('folders, git and enforcement', () => {
  it('builds the folder tree, lists loops and unplaced modules', () => {
    const p = project(
      {
        folders: [
          { id: 'a', name: '_Project' },
          { id: 'b', name: 'Scripts', parent: 'a', module: 'm1' },
          { id: 'x', name: 'Loop1', parent: 'y' },
          { id: 'y', name: 'Loop2', parent: 'x' },
          { id: 'z', name: 'Orphan', parent: 'gone' },
        ],
      },
      { modules: [{ id: 'm1', name: 'Core' }, { id: 'm2', name: 'UI' }] },
    )
    const t = folderTree(p)
    expect(t.roots.map((n) => n.folder.name)).toEqual(['_Project', 'Loop1', 'Loop2', 'Orphan'])
    expect(t.byId.get('b')?.path).toBe('Assets/_Project/Scripts')
    expect(t.loops.map((f) => f.id)).toEqual(['x', 'y'])
    expect(moduleFolders(p).unplaced.map((m) => m.id)).toEqual(['m2'])
  })
  it('checks binary file types against LFS patterns', () => {
    const p = project({ folders: [{ id: 'a', name: 'Art', contents: ['.psd', '.png', '.mat'] }, { id: 'b', name: 'Audio', contents: ['WAV'] }], git: { lfs: ['*.PSD'] } })
    expect(lfsCoverage(p).map((r) => `${r.ext}:${r.covered}`)).toEqual(['.psd:true', '.png:false'])
  })
  it('matches branch patterns and finds loose ends in the flow', () => {
    expect(branchRegex('feature/<ticket>-<desc>')!.test('feature/HOH-1-x')).toBe(true)
    expect(branchRegex('feature/<ticket>-<desc>')!.test('feature/a/b-c')).toBe(false)
    const p = project({
      branches: [
        { id: 'f', name: 'feature', pattern: 'feature/*', from: 'd' },
        { id: 'm', name: 'main', lifetime: 'Permanent' },
        { id: 'd', name: 'develop', lifetime: 'Permanent', protected: true, mergesInto: ['gone'] },
      ],
    })
    expect(matchBranch(p, 'feature/x/y').map((b) => b.id)).toEqual(['f'])
    expect(matchBranch(p, 'main').map((b) => b.id)).toEqual(['m'])
    expect(branchFlow(p).map((r) => `${r.branch.id}:${r.issues.join('+')}`)).toEqual(['m:unprotectedMain', 'd:missingRef', 'f:noTarget'])
  })
  it('checks commit messages by format', () => {
    expect(checkCommit('Conventional Commits', 'feat(npc): add hunger')).toBe(true)
    expect(checkCommit('Conventional Commits', 'added hunger')).toBe(false)
    expect(checkCommit('Ticket prefix', 'HOH-12 Fix save')).toBe(true)
    expect(checkCommit('Free', 'anything')).toBeNull()
  })
  it('counts automated rules per source', () => {
    const p = project({
      naming: [{ id: 'n1', enforcement: 'Roslyn analyzer' }, { id: 'n2' }],
      review: [{ id: 'r1', enforcement: 'CI check', severity: 'Blocker' }, { id: 'r2', severity: 'Blocker' }, { id: 'r3', enforcement: 'Manual' }],
    })
    const s = enforcementSummary(p)
    expect(s.total).toEqual({ total: 5, automated: 2, share: 0.4 })
    expect(s.bySource.map((x) => `${x.section}:${x.automated}/${x.total}`)).toEqual(['naming:1/2', 'assetRules:0/0', 'review:1/3'])
    expect(s.manualBlockers.map((r) => r.rule.id)).toEqual(['r2'])
  })
})

describe('coding hints', () => {
  it('stay quiet on an empty doc and in other editors', () => {
    expect(ruleIds(project({ naming: [], review: [] }))).toEqual([])
    const p = project({ naming: [{ id: 'r', casing: 'PascalCase', example: 'bad' }] })
    expect(ruleIds(p, ARCH_DOC)).toEqual([])
  })
  it('fire on each problem and never exceed suggest', () => {
    const p = project(
      {
        standards: { legacyNotes: 'old' },
        naming: [{ id: 'r', casing: 'PascalCase', example: 'bad' }, { id: 'ns', target: 'Namespace', casing: 'PascalCase' }],
        folders: [{ id: 'a', name: 'Art', contents: ['.psd'] }, { id: 'x', name: 'X', parent: 'y' }, { id: 'y', name: 'Y', parent: 'x' }],
        branches: [{ id: 'm', name: 'main', lifetime: 'Permanent' }, { id: 'f', name: 'feature', from: 'm' }],
        review: [{ id: 'c', name: 'Check', severity: 'Blocker' }],
      },
      { modules: [{ id: 'm1', name: 'Core', assembly: 'core' }] },
    )
    expect(ruleIds(p)).toEqual(['coding.branch', 'coding.example', 'coding.folderLoop', 'coding.legacy', 'coding.lfs', 'coding.manualBlocker', 'coding.namespace', 'coding.protect', 'coding.unplaced'])
    const hints = collectHints(makeContext(p, { docId: CODING_DOC })).filter((h) => h.ruleId.startsWith('coding.'))
    expect(hints.every((h) => h.severity === 'suggest' || h.severity === 'info')).toBe(true)
  })
  it('are quiet for a clean setup', () => {
    const p = project(
      {
        naming: [{ id: 'r', casing: 'PascalCase', example: 'Good', counterExample: 'bad' }, { id: 'ns', target: 'Namespace', casing: 'PascalCase' }],
        folders: [{ id: 'a', name: 'Art', contents: ['.psd'], module: 'm1' }],
        git: { lfs: ['*.psd'] },
        branches: [{ id: 'm', name: 'main', lifetime: 'Permanent', protected: true }, { id: 'f', name: 'feature', from: 'm', mergesInto: ['m'] }],
        review: [{ id: 'c', name: 'Check', severity: 'Blocker', enforcement: 'CI check' }],
      },
      { modules: [{ id: 'm1', name: 'Core', assembly: 'Core' }] },
    )
    expect(ruleIds(p)).toEqual([])
  })
})
