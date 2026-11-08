import { useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  archModules,
  branchFlow,
  branchRegex,
  checkCommit,
  checkName,
  CODING_DOC,
  codingList,
  enforcementSummary,
  exampleIssues,
  folderTree,
  lfsCoverage,
  matchBranch,
  moduleFolders,
  namePattern,
  nameOf,
  namespaceCheck,
  toCasing,
  type BranchIssue,
  type FolderNode,
  type RuleRow,
} from '../../core/coding'
import { makeId } from '../../core/model/project'
import type { Entity } from '../../core/model/types'
import { ENFORCEMENT, NAME_TARGETS } from '../../modules/technical'
import { countOf } from '../../core/text'
import { useProject, useSection } from '../hooks'
import type { ViewProps } from './CollectionEditor'

/** Series palette (the only hard-coded colours, as in the other planners). */
const COLORS = ['#4f9cf9', '#53c28b', '#f2c94c', '#f97b4f', '#d86be0', '#5ad1d1', '#e5707e', '#a3a8ff']
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const keyActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}
const pct = (x: number) => `${Math.round(x * 100)}%`

// ---- Rule tester ----

/** Prefix · casing · suffix drawn as parts of a name, so the shape of a rule reads at a glance. */
function Anatomy({ rule }: { rule: Entity }) {
  const pat = namePattern(rule)
  if (str(rule.pattern)) return <code className={'code-anatomy custom' + ('error' in pat ? ' bad' : '')}>{'error' in pat ? 'invalid regex' : str(rule.pattern)}</code>
  return (
    <span className="code-anatomy" aria-label={`${str(rule.prefix) || 'no prefix'}, ${str(rule.casing) || 'any casing'}, ${str(rule.suffix) || 'no suffix'}`}>
      {str(rule.prefix) && <span className="code-part fix">{str(rule.prefix)}</span>}
      <span className="code-part body">{str(rule.casing) || 'Any'}</span>
      {str(rule.suffix) && <span className="code-part fix">{str(rule.suffix)}</span>}
    </span>
  )
}

/** A short C# file written with the names the rules produce, so the team sees the style before agreeing on it. */
function CodeSample({ rules, onPick }: { rules: Entity[]; onPick: (id: string) => void }) {
  const make = (target: string, fallback: string[]) => {
    const rule = rules.find((r) => r.target === target)
    if (!rule) return { text: toCasing(fallback, 'PascalCase'), rule: undefined }
    if (str(rule.example)) return { text: str(rule.example), rule }
    const fix = checkName(rule, toCasing(fallback, 'camelCase')).fix
    return { text: fix ?? toCasing(fallback, str(rule.casing) || 'PascalCase'), rule }
  }
  const ns = make('Namespace', ['hoh', 'simulation'])
  const iface = make('Interface', ['damageable'])
  const cls = make('Class / struct', ['npc', 'controller'])
  const con = make('Constant', ['max', 'hunger'])
  const field = make('Private field', ['hunger'])
  const prop = make('Property', ['is', 'starving'])
  const method = make('Method', ['apply', 'damage'])
  const param = make('Parameter / local', ['amount'])
  const ev = make('Event', ['died'])
  const nm = (n: { text: string; rule?: Entity }) =>
    n.rule ? (
      <button className="code-name linklike" title={`Rule: ${nameOf(n.rule)}`} onClick={() => onPick(n.rule!.id)}>
        {n.text}
      </button>
    ) : (
      <span className="code-name none" title="No rule for this kind of name">{n.text}</span>
    )
  return (
    <pre className="code-sample" aria-label="Code sample">
      <span className="kw">namespace</span> {nm(ns)}
      {'\n{\n    '}
      <span className="kw">public class</span> {nm(cls)} : MonoBehaviour, {nm(iface)}
      {'\n    {\n        '}
      <span className="kw">const float</span> {nm(con)} = 100f;
      {'\n        '}
      <span className="kw">float</span> {nm(field)};
      {'\n        '}
      <span className="kw">public event</span> Action {nm(ev)};
      {'\n        '}
      <span className="kw">public bool</span> {nm(prop)} =&gt; {nm(field)} &gt;= {nm(con)};
      {'\n\n        '}
      <span className="kw">public void</span> {nm(method)}(<span className="kw">float</span> {nm(param)})
      {'\n        {\n            '}
      {nm(field)} += {nm(param)};
      {'\n        }\n    }\n}'}
    </pre>
  )
}

/** Type any name: every rule says whether it passes, why not, and what the fixed name would be. */
export function NamingTesterView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const targets = NAME_TARGETS.filter((t) => items.some((r) => r.target === t))
  const rules = items.filter((r) => !target || r.target === target)
  const issues = exampleIssues(project)
  const issueOf = new Map(issues.map((i) => [i.rule.id, i.problem]))
  const ns = namespaceCheck(project)
  const tried = name.trim()
  const results = rules.map((rule) => ({ rule, check: checkName(rule, tried) }))
  const passing = results.filter((r) => r.check.pass).length
  if (!items.length) return null
  return (
    <div className="stack code-view code-tester">
      <p className="muted">Type a name to test it against every rule. Each rule reads as prefix · casing · suffix. Without a name, each rule checks its own good and bad example.</p>
      <div className="row code-try">
        <input aria-label="Try a name" placeholder="Try a name, e.g. playerHealth" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Rule target" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">All kinds of names</option>
          {targets.map((t) => <option key={t}>{t}</option>)}
        </select>
        {tried && <span className={'pill ' + (passing ? 'ok' : 'warning')}>{passing} of {rules.length} rules pass</span>}
      </div>
      <div className="code-rules">
        {results.map(({ rule, check }) => {
          const problem = issueOf.get(rule.id)
          const exGood = str(rule.example) ? checkName(rule, str(rule.example)).pass : null
          const exBad = str(rule.counterExample) ? checkName(rule, str(rule.counterExample)).pass : null
          return (
            <div
              key={rule.id}
              className={'code-rule' + (rule.id === selected ? ' selected' : '') + (tried ? (check.pass ? ' pass' : check.pass === false ? ' fail' : '') : problem ? ' fail' : '')}
              role="button"
              tabIndex={0}
              aria-label={`Rule ${nameOf(rule)}`}
              onClick={() => onSelect(rule.id)}
              onKeyDown={keyActivate(() => onSelect(rule.id))}
            >
              <div className="code-rule-head">
                <span className="code-verdict" aria-hidden="true">{tried ? (check.pass ? '✓' : check.pass === false ? '✗' : '?') : problem ? '!' : '•'}</span>
                <strong>{nameOf(rule)}</strong>
                <span className="muted">{str(rule.target) || 'Any name'}</span>
                <span className="spacer" />
                <Anatomy rule={rule} />
              </div>
              {tried ? (
                check.pass === false && (
                  <div className="code-rule-body">
                    <span className="warn">{check.reasons.join('; ')}</span>
                    {check.fix && (
                      <button
                        className="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          setName(check.fix!)
                        }}
                      >
                        Try “{check.fix}”
                      </button>
                    )}
                  </div>
                )
              ) : (
                <div className="code-rule-body">
                  {str(rule.example) && <span className={exGood ? 'ok' : 'warn'}>{exGood ? '✓' : '✗'} {str(rule.example)}</span>}
                  {str(rule.counterExample) && <span className={exBad ? 'warn' : 'muted'}>{exBad ? '✓ (should fail)' : '✗'} <s>{str(rule.counterExample)}</s></span>}
                  {problem === 'example' && <span className="warn">The good example breaks this rule.</span>}
                  {problem === 'counterExample' && <span className="warn">The bad example passes this rule.</span>}
                  {problem === 'pattern' && <span className="warn">The custom pattern is not a valid regex.</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <details className="panel" open>
        <summary><strong>Code sample</strong> <span className="muted">— names built from your rules; click one to open its rule</span></summary>
        <CodeSample rules={codingList(project, 'naming')} onPick={onSelect} />
      </details>
      {ns.rule && (
        <details className="panel" open={ns.rows.some((r) => r.check.pass === false)}>
          <summary>
            <strong>Architecture assemblies</strong> <span className="muted">vs the “{nameOf(ns.rule)}” rule — {ns.rows.filter((r) => r.check.pass).length} of {ns.rows.length} pass</span>
          </summary>
          {ns.rows.length ? (
            <table className="grid">
              <thead><tr><th>Module</th><th>Assembly</th><th>Result</th></tr></thead>
              <tbody>
                {ns.rows.map((r) => (
                  <tr key={r.module.id}>
                    <td>{nameOf(r.module)}</td>
                    <td><code>{r.assembly}</code></td>
                    <td>{r.check.pass ? <span className="ok">✓</span> : <span className="warn">✗ {r.check.reasons.join('; ')}{r.check.fix ? ` → ${r.check.fix}` : ''}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No Technical Architecture module has an assembly name yet.</p>
          )}
        </details>
      )}
    </div>
  )
}

// ---- Folder tree ----

const OWN_ICON: Record<string, string> = { 'Generated (don’t edit)': '⚙', 'Third-party (don’t edit)': '🔒', 'Team-owned': '👥' }

/** The Assets/ tree with module owners and .asmdef markers. Add sub-folders in place; place Architecture modules with one click. */
export function FolderTreeView({ docId, sec, items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const { update } = useSection<Entity[]>(docId, sec.id)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const tree = folderTree(project)
  const mods = archModules(project)
  const modColor = new Map(mods.map((m, i) => [m.id, COLORS[i % COLORS.length]]))
  const placement = moduleFolders(project)
  const lfs = lfsCoverage(project)
  const shown = new Set(items.map((i) => i.id))
  const add = (init: Record<string, unknown>) => {
    const id = makeId()
    update((d) => void d.push({ id, ...init }))
    onSelect(id)
  }
  const toggle = (id: string) =>
    setClosed((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const scripts = tree.flat.find((n) => /^(_?scripts|code|src)$/i.test(nameOf(n.folder)) || /\/_?(Game|Project)\/Scripts$/i.test(n.path))
  const row = (n: FolderNode): ReactNode => {
    const f = n.folder
    const open = !closed.has(f.id)
    const hit = shown.has(f.id)
    const mod = mods.find((m) => m.id === f.module)
    return (
      <li key={f.id}>
        <div
          className={'code-folder' + (f.id === selected ? ' selected' : '') + (hit ? '' : ' dim')}
          style={{ paddingLeft: 6 + n.depth * 20 }}
          role="button"
          tabIndex={0}
          aria-label={`Folder ${n.path}`}
          onClick={() => onSelect(f.id)}
          onKeyDown={keyActivate(() => onSelect(f.id))}
        >
          {n.children.length ? (
            <button
              className="code-twist"
              aria-label={(open ? 'Collapse ' : 'Expand ') + nameOf(f)}
              aria-expanded={open}
              onClick={(e) => {
                e.stopPropagation()
                toggle(f.id)
              }}
            >
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="code-twist" />
          )}
          <span aria-hidden="true">{n.children.length && open ? '📂' : '📁'}</span>
          <strong>{nameOf(f)}</strong>
          {f.asmdef && <span className="pill code-asmdef" title="Has an assembly definition">.asmdef</span>}
          {mod && (
            <span className="chip" style={{ borderColor: modColor.get(mod.id) }} title="Technical Architecture module">
              <i className="npc-swatch" style={{ background: modColor.get(mod.id) }} /> {nameOf(mod)}
            </span>
          )}
          {OWN_ICON[f.ownership] && <span title={f.ownership}>{OWN_ICON[f.ownership]}</span>}
          {ids(f.contents).length > 0 && <span className="muted code-types">{ids(f.contents).join(' ')}</span>}
          <span className="spacer" />
          {str(f.purpose) && <small className="muted code-purpose">{str(f.purpose)}</small>}
          <button
            className="small code-addsub"
            aria-label={`Add a folder inside ${nameOf(f)}`}
            onClick={(e) => {
              e.stopPropagation()
              setClosed((s) => {
                const c = new Set(s)
                c.delete(f.id)
                return c
              })
              add({ name: 'New folder', parent: f.id })
            }}
          >
            + sub
          </button>
        </div>
        {open && n.children.length > 0 && <ul className="code-tree">{n.children.map(row)}</ul>}
      </li>
    )
  }
  return (
    <div className="stack code-view">
      <p className="muted">Click a folder to edit it; “+ sub” adds a folder inside. Chips show the Technical Architecture module that owns a folder; 🔒 and ⚙ mark folders nobody edits by hand.</p>
      <div className="panel code-tree-wrap">
        <div className="code-folder root" aria-hidden="true">📦 <strong>Assets</strong> <span className="muted">{countOf(items.length, 'folder')}</span></div>
        <ul className="code-tree">{tree.roots.map(row)}</ul>
        <button className="small" onClick={() => add({ name: 'New folder' })}>+ Folder under Assets</button>
      </div>
      {tree.loops.length > 0 && <p className="warn">These folders are inside themselves (parent loop) and are shown at the top: {tree.loops.map(nameOf).join(', ')}.</p>}
      {mods.length > 0 && (
        <div className="panel stack">
          <strong>Architecture modules {placement.unplaced.length ? <span className="warn">— {placement.unplaced.length} without a folder</span> : <span className="ok">— all placed</span>}</strong>
          <div className="chips">
            {placement.rows.map((r) =>
              r.folders.length ? (
                <span key={r.module.id} className="chip" title={r.folders.map((f) => f.path).join(', ')}>
                  <i className="npc-swatch" style={{ background: modColor.get(r.module.id) }} /> {nameOf(r.module)} ✓
                </span>
              ) : (
                <button key={r.module.id} className="small" onClick={() => add({ name: toCasing(nameOf(r.module).split('.').pop()!.split(/\s+/), 'PascalCase'), parent: scripts?.folder.id, module: r.module.id, asmdef: true, contents: ['.cs', '.asmdef'] })}>
                  + Folder for {nameOf(r.module)}
                </button>
              ),
            )}
          </div>
        </div>
      )}
      {lfs.length > 0 && (
        <div className="row code-lfs">
          <span className="muted">Binary files vs Git LFS:</span>
          {lfs.map((x) => (
            <span key={x.ext} className={'pill ' + (x.covered ? 'ok' : 'warning')} title={x.folders.map(nameOf).join(', ')}>
              {x.covered ? '✓' : '✗'} {x.ext}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Branch flow ----

const ISSUE_TEXT: Record<BranchIssue, string> = {
  noTarget: 'merges nowhere',
  noSource: 'no source branch',
  missingRef: 'points at a deleted branch',
  unprotectedMain: 'final branch is not protected',
}

/** Branch types as swim lanes: where each one starts, where it merges back, and the rules on the way. With name and commit testers. */
export function BranchFlowView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const [branch, setBranch] = useState('')
  const [commit, setCommit] = useState('')
  const flow = branchFlow(project).filter((r) => items.some((i) => i.id === r.branch.id))
  const hits = new Set(matchBranch(project, branch).map((b) => b.id))
  const git = project.documents[CODING_DOC]?.data.git ?? {}
  const commitOk = checkCommit(git.commitFormat, commit)
  if (!flow.length) return null
  const LABEL = 170
  const LANE = 54
  const SLOT = 120
  const lane = new Map(flow.map((r, i) => [r.branch.id, i]))
  const color = new Map(flow.map((r, i) => [r.branch.id, COLORS[i % COLORS.length]]))
  const temp = flow.filter((r) => r.branch.lifetime !== 'Permanent')
  const W = LABEL + Math.max(2, temp.length) * SLOT + 90
  const H = flow.length * LANE + 8
  const y = (id: string) => 4 + (lane.get(id) ?? 0) * LANE + LANE / 2
  const span = new Map(temp.map((r, i) => [r.branch.id, { x0: LABEL + 40 + i * SLOT, x1: LABEL + 40 + i * SLOT + SLOT - 40 }]))
  const issues = flow.filter((r) => r.issues.length)
  return (
    <div className="stack code-view">
      <p className="muted">One lane per branch type, permanent branches on top. A branch leaves its source lane, collects commits, then merges into its targets. 🔒 = protected, ✓CI = CI must pass. Click a lane to edit it.</p>
      <div className="npc-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} className="arch-svg" role="img" aria-label="Branch flow">
          {flow.map((r) => {
            const b = r.branch
            const yy = y(b.id)
            const s = span.get(b.id)
            const hit = hits.has(b.id)
            const badges = [b.protected ? '🔒' : '', b.ciRequired ? '✓CI' : '', typeof b.approvals === 'number' && b.approvals > 0 ? `${b.approvals}👍` : ''].filter(Boolean).join(' ')
            return (
              <g
                key={b.id}
                className={'code-lane' + (b.id === selected ? ' selected' : '') + (hit ? ' hit' : '') + (branch.trim() && !hit ? ' dim' : '')}
                role="button"
                tabIndex={0}
                aria-label={`Branch ${nameOf(b)}`}
                onClick={() => onSelect(b.id)}
                onKeyDown={keyActivate(() => onSelect(b.id))}
              >
                <rect x={0} y={yy - LANE / 2 + 3} width={W} height={LANE - 6} rx={8} className="code-lane-bg" />
                <text x={12} y={yy - 5} className="code-lane-name">{nameOf(b)}</text>
                <text x={12} y={yy + 12} className="code-lane-sub">{str(b.pattern) || str(b.lifetime) || ' '}</text>
                {s ? (
                  <>
                    <line x1={s.x0} y1={yy} x2={s.x1} y2={yy} stroke={color.get(b.id)} strokeWidth={4} strokeLinecap="round" />
                    {[0.25, 0.5, 0.75].map((t) => <circle key={t} cx={s.x0 + (s.x1 - s.x0) * t} cy={yy} r={4.5} fill={color.get(b.id)} className="code-commit" />)}
                  </>
                ) : (
                  <line x1={LABEL} y1={yy} x2={W - 10} y2={yy} stroke={color.get(b.id)} strokeWidth={5} strokeLinecap="round" />
                )}
                {badges && <text x={LABEL - 8} y={yy + 4} textAnchor="end" className="code-lane-sub">{badges}</text>}
                {r.issues.length > 0 && <text x={W - 14} y={yy - 10} textAnchor="end" className="code-lane-warn">⚠ {r.issues.map((i) => ISSUE_TEXT[i]).join(', ')}</text>}
              </g>
            )
          })}
          {temp.map((r) => {
            const s = span.get(r.branch.id)!
            const yy = y(r.branch.id)
            const c = color.get(r.branch.id)
            return (
              <g key={r.branch.id} className={'code-merge' + (branch.trim() && !hits.has(r.branch.id) ? ' dim' : '')}>
                {r.from && (
                  <>
                    <circle cx={s.x0 - 30} cy={y(r.from.id)} r={4} fill={c} />
                    <path d={`M${s.x0 - 30},${y(r.from.id)} C${s.x0 - 10},${y(r.from.id)} ${s.x0 - 20},${yy} ${s.x0},${yy}`} stroke={c} />
                  </>
                )}
                {r.into.map((t) => (
                  <g key={t.id}>
                    <path d={`M${s.x1},${yy} C${s.x1 + 20},${yy} ${s.x1 + 14},${y(t.id)} ${s.x1 + 34},${y(t.id)}`} stroke={c} strokeDasharray={r.branch.mergeMethod === 'Squash' ? '5 3' : undefined} />
                    <circle cx={s.x1 + 38} cy={y(t.id)} r={5} fill="var(--bg)" stroke={color.get(t.id)} strokeWidth={2} />
                  </g>
                ))}
              </g>
            )
          })}
        </svg>
      </div>
      <p className="muted">Filled dot = where a branch starts. Hollow dot = its merge commit on the target. Dashed = squash merge.</p>
      {issues.length > 0 && <p className="warn">{issues.map((r) => `${nameOf(r.branch)}: ${r.issues.map((i) => ISSUE_TEXT[i]).join(', ')}`).join(' · ')}</p>}
      <div className="code-testers">
        <label className="stack">
          <span>Try a branch name</span>
          <input placeholder="e.g. feature/HOH-12-hunger" value={branch} onChange={(e) => setBranch(e.target.value)} />
          {branch.trim() && (
            <span className={hits.size ? 'ok' : 'warn'}>
              {hits.size ? `✓ ${flow.filter((r) => hits.has(r.branch.id)).map((r) => nameOf(r.branch)).join(', ')}` : `✗ matches no branch type (${flow.map((r) => str(r.branch.pattern)).filter((x) => branchRegex(x)).join(', ') || 'no patterns yet'})`}
            </span>
          )}
        </label>
        <label className="stack">
          <span>Try a commit message <span className="muted">({str(git.commitFormat) || 'no format set'})</span></span>
          <input placeholder={str(git.commitExample) || 'e.g. feat(npc): add hunger decay'} value={commit} onChange={(e) => setCommit(e.target.value)} />
          {commitOk !== null && <span className={commitOk ? 'ok' : 'warn'}>{commitOk ? '✓ follows the format' : git.commitFormat === 'Conventional Commits' ? '✗ expected type(scope): summary, e.g. fix(save): keep slot order' : '✗ expected a ticket first, e.g. HOH-42 Fix save order'}</span>}
        </label>
      </div>
    </div>
  )
}

// ---- Enforcement board ----

const STAGES = ['IDE / .editorconfig', 'Roslyn analyzer', 'Asset validator', 'CI check', 'Manual']
const STAGE_HELP: Record<string, string> = {
  'IDE / .editorconfig': 'while typing',
  'Roslyn analyzer': 'at compile',
  'Asset validator': 'on import / save',
  'CI check': 'on push',
  Manual: 'in review',
}
const SOURCE_LABEL: Record<string, string> = { naming: 'Naming', assetRules: 'Asset', review: 'Review' }

/** Every rule of the document on a left-to-right ladder from “caught while typing” to “caught by a person”, with the automated share. */
export function EnforcementBoardView({ docId, items, selected, onSelect, patch }: ViewProps) {
  const project = useProject()
  const [cat, setCat] = useState('')
  const sum = enforcementSummary(project)
  const shown = new Set(items.map((i) => i.id))
  const visible = (r: RuleRow) => (r.section !== 'review' || shown.has(r.rule.id)) && (!cat || r.rule.category === cat)
  const cats = [...new Set(codingList(project, 'review').map((r) => str(r.category)).filter(Boolean))]
  if (!sum.rows.length) return null
  return (
    <div className="stack code-view">
      <p className="muted">
        Left is cheap: a rule the IDE or an analyzer catches never reaches review. Move rules left when you can. Review checks can be moved here with the selector; naming and asset rules are edited in their own sections.
      </p>
      <div className="code-meters">
        {[{ label: 'All rules', ...sum.total }, ...sum.bySource].map((s) => (
          <div key={s.label} className="code-meter">
            <div className="row"><strong>{s.label}</strong><span className="spacer" /><span className="muted">{s.automated}/{s.total} automated</span></div>
            <div className={'code-meter-track' + (s.total ? '' : ' empty')} role="img" aria-label={`${s.label}: ${pct(s.share)} automated`}>
              <div className="code-meter-auto" style={{ width: pct(s.share) }} />
            </div>
            <small className="muted">{s.total ? pct(s.share) : '–'}</small>
          </div>
        ))}
      </div>
      {cats.length > 0 && (
        <div className="row">
          <span className="muted">Category:</span>
          <button className={'small' + (cat ? '' : ' active')} onClick={() => setCat('')}>All</button>
          {cats.map((c) => <button key={c} className={'small' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}
      <div className="code-ladder">
        {STAGES.map((stage) => {
          const rows = sum.rows.filter((r) => r.enforcement === stage && visible(r))
          return (
            <div key={stage} className={'code-stage' + (stage === 'Manual' ? ' manual' : '')}>
              <div className="code-stage-head">
                <strong>{stage}</strong>
                <small className="muted">{STAGE_HELP[stage]} · {rows.length}</small>
              </div>
              {rows.map((r) => {
                const own = r.section === 'review' && docId === CODING_DOC
                return (
                  <div
                    key={r.section + r.rule.id}
                    className={'code-card sev-' + r.severity.toLowerCase() + (r.rule.id === selected ? ' selected' : '')}
                    role={own ? 'button' : undefined}
                    tabIndex={own ? 0 : undefined}
                    aria-label={own ? `Check ${nameOf(r.rule)}` : undefined}
                    onClick={own ? () => onSelect(r.rule.id) : undefined}
                    onKeyDown={own ? keyActivate(() => onSelect(r.rule.id)) : undefined}
                  >
                    <div className="row">
                      <span className="pill">{SOURCE_LABEL[r.section]}</span>
                      <span className="code-sev">{r.severity}</span>
                      {r.rule.adopted === false && <span className="muted" title="Not yet agreed by the team">draft</span>}
                    </div>
                    <span>{nameOf(r.rule)}</span>
                    {own && (
                      <select
                        aria-label={`Enforcement of ${nameOf(r.rule)}`}
                        value={r.enforcement}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => patch(r.rule.id, 'enforcement', e.target.value)}
                      >
                        {ENFORCEMENT.map((x) => <option key={x}>{x}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {sum.manualBlockers.length > 0 && <p className="warn">Blockers only a person catches: {sum.manualBlockers.map((r) => nameOf(r.rule)).join(', ')}. A tool that fails the build is more reliable.</p>}
    </div>
  )
}
