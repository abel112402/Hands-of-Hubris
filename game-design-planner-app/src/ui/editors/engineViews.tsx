import { useEffect, useMemo, useState } from 'react'
import { fieldMapLine, fieldMapOf, nameOf, NO_FIELD, sourceOf } from '../../core/dataDriven'
import type { EngineId } from '../../core/engine/adapter'
import { getAdapter } from '../../core/engine/adapters'
import { buildBundle } from '../../core/engine/bundle'
import { matchField, sourceFields, type EngineIR, type EngineIssue, type IssueLevel } from '../../core/engine/ir'
import { PrototypePanel } from './prototypePanel'
import { ENGINE_TARGETS, engineFromStack, engineTarget } from '../../core/engine/target'
import type { Entity } from '../../core/model/types'
import { countOf } from '../../core/text'
import { exportEngineZip, importEngineReport, setEngineTarget } from '../actions'
import { canLinkFolders, interruptedLinkedWrite, linkEngineFolder, previewLinkedFolder, readReportFromLinkedFolder, restoreLinkedFolder, setExportOnSave, unlinkEngineFolder, useEngineLink, writeToLinkedFolder } from '../engineLink'
import { classProblems, reportBySchema, reportLabel, reportProblems, reportStale, reportSummary, storedReport } from '../../core/engine/report'
import { applySuggestions, dismissSuggestions, statusSuggestions, type StatusSuggestion } from '../../core/engine/suggestions'
import { getModule } from '../../core/modules/registry'
import { liveLinkAvailable, livePing, livePushValues, liveStatus, type LiveLink, type LiveStatus } from '../../core/engine/liveLink'
import { buildIR } from '../../core/engine/ir'
import { useStore } from '../../core/store/store'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const MARK: Record<IssueLevel, { icon: string; label: string }> = {
  error: { icon: '✗', label: 'Error' },
  warning: { icon: '⚠', label: 'Warning' },
  info: { icon: 'ℹ', label: 'Note' },
}
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const FIELD_PROBLEMS = new Set(['record.missing', 'record.unresolved', 'map.unknownSource'])

/** Records with at least one asset field (icon, prefab…) left empty in the plan: the engine gets a placeholder for them. */
function placeholderRecords(ir: EngineIR): number {
  const assetFields = new Map(ir.schemas.map((s) => [s.id, s.fields.filter((f) => f.type.k === 'asset').map((f) => f.name)]))
  return ir.records.filter((r) => (assetFields.get(r.schema) ?? []).some((f) => r.values[f] === null || r.values[f] === undefined || r.values[f] === '')).length
}

/** Preview of the engine export: target engine, checks, field mapping, the files it writes and each file's content, with the zip download. */
export function EngineExportView({ items, onSelect, patch }: ViewProps) {
  const project = useProject()
  const target = engineTarget(project)
  const stack = engineFromStack(project)
  const bundle = useMemo(() => buildBundle(project, target.id, 'preview'), [project, target.id])
  const [path, setPath] = useState<string | null>(null)
  const file = bundle.files.find((f) => f.path === path) ?? bundle.files.find((f) => /\.(cs|gd|h)$/.test(f.path)) ?? bundle.files[0]
  const n = (l: IssueLevel) => bundle.issues.filter((i) => i.level === l).length
  const summary = (['error', 'warning', 'info'] as const).filter((l) => n(l)).map((l) => `${MARK[l].icon} ${countOf(n(l), l === 'info' ? 'note' : l)}`)
  const c = bundle.manifest.counts
  const autoLabel = `Automatic (${stack ? ENGINE_TARGETS.find((t) => t.id === stack)!.label + ', from the Architecture stack' : 'Unity'})`
  return (
    <div className="stack dd-view">
      <p className="muted">
        One zip for a game engine: every schema as generated code, its records from the content planners, catalogs as enums, record IDs as constants, formulas as methods, localized texts and location maps. Plan changes are exported again; the files are not edited by hand.
      </p>
      <div className="row" style={{ alignItems: 'center' }}>
        <label className="row" style={{ margin: 0, alignItems: 'center' }}>
          Target engine
          <select aria-label="Target engine" value={target.from === 'setting' ? target.id : ''} onChange={(e) => setEngineTarget((e.target.value || undefined) as EngineId | undefined)}>
            <option value="">{autoLabel}</option>
            {ENGINE_TARGETS.map((t) => (
              <option key={t.id} value={t.id}>{getAdapter(t.id) ? `${t.label} (${getAdapter(t.id)!.language})` : `${t.label} (data only)`}</option>
            ))}
          </select>
        </label>
        <span className="muted">
          {[countOf(bundle.manifest.schemas.length, 'schema'), countOf(c.records, 'record'), countOf(c.enums, 'enum'), countOf(c.formulas, 'formula'), countOf(bundle.files.length, 'file')].join(' · ')}
        </span>
        <button className="primary" onClick={() => void exportEngineZip(target.id)}>
          Download .zip
        </button>
      </div>
      <LinkedFolderPanel />
      {target.id === 'unity' && <LiveLinkPanel />}
      {!target.hasAdapter && (
        <p className="engine-note" role="note">
          There is no {target.label} code generator yet: the zip holds the engine-neutral part (records, enums, formulas, strings, maps and <code>ir/engine-ir.json</code>), not {target.label} code.
        </p>
      )}
      <section aria-label="Export checks" className="engine-checks">
        <strong>{summary.length ? summary.join(' · ') : '✓ No findings'}</strong>
        {bundle.issues.length > 0 && (
          <ul>
            {bundle.issues.map((i, k) => (
              <li key={k} className={'engine-issue ' + i.level}>
                <span aria-hidden="true">{MARK[i.level].icon} </span>
                <span className="sr-only">{MARK[i.level].label}: </span>
                {i.schema ? (
                  <button className="link" onClick={() => onSelect(i.schema)}>
                    {i.message}
                  </button>
                ) : (
                  i.message
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <PrototypePanel project={project} engine={target.id} placeholders={placeholderRecords(bundle.ir)} />
      <EngineStatusPanel />
      <StatusSuggestionsPanel />
      <FieldMapping schemas={items} issues={bundle.issues} patch={patch} />
      <div className="engine-files">
        <ul className="engine-tree" aria-label="Files in the export">
          {bundle.files.map((f) => (
            <li key={f.path}>
              <button className="ghost" aria-pressed={f.path === file.path} onClick={() => setPath(f.path)}>
                {f.path}
              </button>
            </li>
          ))}
        </ul>
        <pre className="engine-code" tabIndex={0} aria-label={`Preview of ${file.path}`}>
          {file.content}
        </pre>
      </div>
    </div>
  )
}

/** Per schema: which content-planner field fills each schema field. Open where a field is not filled. */
function FieldMapping({ schemas, issues, patch }: { schemas: Entity[]; issues: EngineIssue[]; patch: ViewProps['patch'] }) {
  const project = useProject()
  const withSource = schemas.filter((s) => sourceOf(s))
  if (!withSource.length) return null
  return (
    <section aria-label="Field mapping" className="engine-map">
      <strong>Field mapping</strong>
      <p className="muted">Which content-planner field fills each schema field. Automatic matches the same name, title → name, or a shorter name the field starts with (stack → stackSize).</p>
      {withSource.map((s) => {
        const fields = [...ids(s.required).map((r) => ({ raw: r, optional: false })), ...ids(s.optional).map((r) => ({ raw: r, optional: true }))]
          .map((f) => ({ ...f, name: f.raw.split(':')[0].trim() }))
          .filter((f) => f.name && f.name.toLowerCase() !== 'id')
        const options = sourceFields(project, s)
        const map = fieldMapOf(s)
        const problems = (field: string) => issues.filter((i) => i.schema === s.id && i.field === field && FIELD_PROBLEMS.has(i.code))
        const open = fields.filter((f) => problems(f.name).length).length
        const set = (field: string, value: string) => {
          const lines = ids(s.fieldMap).filter((l) => fieldMapOf({ id: '', fieldMap: [l] }).keys().next().value !== field)
          patch(s.id, 'fieldMap', value ? [...lines, fieldMapLine(field, value)] : lines)
        }
        return (
          <details key={s.id} open={open > 0}>
            <summary>
              {nameOf(s)} <span className="muted">← {sourceOf(s)!.label}{open ? ` · ${countOf(open, 'field')} not filled` : ''}</span>
            </summary>
            <table className="engine-map-table">
              <thead>
                <tr>
                  <th scope="col">Schema field</th>
                  <th scope="col">Filled from</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => {
                  const auto = f.name.toLowerCase() === 'name' ? 'name' : matchField(options.map((o) => o.id), f.name)
                  const autoText = auto ? `Automatic: ${options.find((o) => o.id === auto)?.label ?? auto}` : 'Automatic: no match'
                  const p = problems(f.name)
                  return (
                    <tr key={f.name}>
                      <th scope="row">
                        <code>{f.raw}</code>
                        {f.optional && <span className="muted"> (optional)</span>}
                      </th>
                      <td>
                        <select aria-label={`${nameOf(s)}.${f.name} filled from`} value={map.get(f.name) ?? ''} onChange={(e) => set(f.name, e.target.value)}>
                          <option value="">{autoText}</option>
                          <option value={NO_FIELD}>— None (set in the engine)</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>{o.label === o.id ? o.id : `${o.label} (${o.id})`}</option>
                          ))}
                        </select>
                      </td>
                      <td className={p.length ? 'warn' : 'ok'}>{p.length ? `⚠ ${p.map((i) => i.message.replace(/^[^:]+:\s*/, '')).join(' ')}` : '✓'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </details>
        )
      })}
    </section>
  )
}

/** What the engine project reported back: per schema, the records that are done, incomplete or missing, and the classes still to write. */
function EngineStatusPanel() {
  const project = useProject()
  const report = storedReport(project)
  if (!report)
    return (
      <section aria-label="Engine status" className="engine-map">
        <strong>Engine status</strong>
        <p className="muted">No engine report yet. In Unity, with the planner bridge package: Tools ▸ Game Design Planner ▸ Write report for the planner; in Godot, with the planner addon: Project ▸ Tools ▸ Game Design Planner ▸ Write report; in Unreal, with the bridge plugin: Tools ▸ Game Design Planner ▸ Write report. Each also writes it after every import; then import its hoh-engine-report.json here.</p>
        <div className="row" style={{ margin: 0 }}>
          <button onClick={() => void importEngineReport()}>Import engine report…</button>
        </div>
      </section>
    )
  const rows = reportBySchema(project).filter((r) => r.total > 0)
  const problems = reportProblems(project)
  const classes = classProblems(project)
  return (
    <section aria-label="Engine status" className="engine-map engine-status">
      <strong>Engine status</strong>
      <p>{reportSummary(report)}</p>
      <p className="muted">Report written {new Date(report.generatedAt).toLocaleString()}, imported {new Date(report.importedAt).toLocaleString()}.</p>
      {reportStale(project) && (
        <p className="engine-note" role="note">
          The plan changed since the engine project was last imported: export, import it in the engine and write a new report.
        </p>
      )}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">Schema</th>
              <th scope="col" className="num">In the plan</th>
              <th scope="col" className="num">✓ Done</th>
              <th scope="col" className="num">⚠ Incomplete</th>
              <th scope="col" className="num">✗ Missing</th>
              <th scope="col" className="num">– Removed</th>
              <th scope="col" className="num">Not in the engine</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.schema.id}>
                <th scope="row">{nameOf(r.schema)}</th>
                <td className="num">{r.total}</td>
                <td className="num">{r.counts.implemented}</td>
                <td className="num">{r.counts.incomplete}</td>
                <td className="num">{r.counts.missing}</td>
                <td className="num">{r.counts.deprecated}</td>
                <td className="num">{r.counts.notInEngine}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {problems.length > 0 && (
        <details>
          <summary>{countOf(problems.length, 'record')} to finish in the engine</summary>
          <ul className="engine-problems">
            {problems.slice(0, 100).map((x) => (
              <li key={String(x.entity.id)}>
                <span aria-hidden="true">{x.status === 'missing' ? '✗' : '⚠'} </span>
                <strong>{nameOf(x.entity)}</strong> <span className="muted">({x.schema ? nameOf(x.schema) : '?'})</span>: {x.issues.join('; ') || (x.status === 'missing' ? 'no asset yet' : 'incomplete')}
              </li>
            ))}
          </ul>
        </details>
      )}
      {classes.length > 0 && (
        <details>
          <summary>{countOf(classes.length, 'class', 'classes')} not written yet</summary>
          <ul className="engine-problems">
            {classes.map((c) => (
              <li key={String(c.cls.id)}>
                <span aria-hidden="true">{c.status === 'missing' ? '✗' : '◐'} </span>
                <strong>{nameOf(c.cls)}</strong>: {c.status === 'missing' ? 'no file in the engine project' : `${c.todo} of ${c.methods} method bodies still TODO`}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="row" style={{ margin: 0 }}>
        <button onClick={() => void importEngineReport()}>Import newer report…</button>
      </div>
    </section>
  )
}

/**
 * The engine folder: link a folder of the engine project once, then every save writes the export into it and the
 * engine's own report is read back when you return to the planner. Chromium browsers only (File System Access API).
 */
function LinkedFolderPanel() {
  const link = useEngineLink()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const linked = !!link
  // Coming back from the engine: pick up a newer report it wrote.
  useEffect(() => {
    if (!linked) return
    const onFocus = () => void readReportFromLinkedFolder(false).then((m) => m && setMessage(m))
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [linked])
  // A write that never finished (browser closed, engine crashed half-way): say so once, with the way back.
  useEffect(() => {
    if (linked) void interruptedLinkedWrite().then((m) => m && setMessage(m))
  }, [linked])
  const run = (fn: () => Promise<string | null>) => {
    setBusy(true)
    void fn()
      .then((m) => m && setMessage(m))
      .finally(() => setBusy(false))
  }
  if (!canLinkFolders())
    return (
      <section aria-label="Engine folder" className="engine-map">
        <strong>Engine folder</strong>
        <p className="muted">This browser cannot write into folders, so use Download .zip and import it in the engine. Chrome and Edge can link the engine project's folder and write the export on every save.</p>
      </section>
    )
  if (link === undefined) return null
  return (
    <section aria-label="Engine folder" className="engine-map">
      <strong>Engine folder</strong>
      {!link ? (
        <>
          <p className="muted">Link the engine project once (for Unity: its project folder, the export goes to Assets/HoHPlanner; for Godot: the folder with project.godot, the export goes to res://HoHPlanner; for Unreal: the folder with the .uproject, the export goes to Plugins/HoHPlanner). Then every save writes the export there, unchanged files are left alone, your own class files are never overwritten, a generated file you changed by hand stops the write until you choose, every overwrite is backed up under .hoh-backup/, and the engine's report is read back when you return here.</p>
          <div className="row" style={{ margin: 0 }}>
            <button disabled={busy} onClick={() => run(linkEngineFolder)}>Link engine folder…</button>
          </div>
        </>
      ) : (
        <>
          <p>
            Linked: <code>{link.label}</code>
          </p>
          <label className="row" style={{ margin: 0, alignItems: 'center' }}>
            <input type="checkbox" checked={link.exportOnSave} onChange={(e) => void setExportOnSave(e.target.checked)} />
            Write the export on every save (Ctrl+S)
          </label>
          <div className="row" style={{ margin: 0 }}>
            <button disabled={busy} onClick={() => run(() => writeToLinkedFolder(true))}>Write now</button>
            <button disabled={busy} onClick={() => run(previewLinkedFolder)}>Preview changes</button>
            <button disabled={busy} onClick={() => run(() => readReportFromLinkedFolder(true))}>Read report</button>
            <button className="ghost" disabled={busy} onClick={() => run(restoreLinkedFolder)}>Restore last write</button>
            <button className="ghost" disabled={busy} onClick={() => run(async () => (await unlinkEngineFolder(), null))}>Unlink</button>
          </div>
          {link.last && (
            <p className={link.last.ok ? 'muted' : 'engine-note'} role="status">
              Last write {new Date(link.last.at).toLocaleString()}: {link.last.text}
            </p>
          )}
          {link.last?.stopped && (
            <div className="row" style={{ margin: 0 }}>
              <button disabled={busy} onClick={() => run(() => writeToLinkedFolder(true, true))}>
                Overwrite them (keep a backup)
              </button>
            </div>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  )
}

/**
 * Status changes the engine report suggests (core/engine/suggestions). Nothing changes until accepted; accepting is one
 * undo step, and dismissed suggestions stay hidden until the next report. Warnings say where the plan claims more than
 * the engine shows; they are never applied.
 */
function StatusSuggestionsPanel() {
  const project = useProject()
  const { suggestions, warnings, report } = statusSuggestions(project)
  if (!report || (!suggestions.length && !warnings.length)) return null
  const accept = (chosen: StatusSuggestion[]) =>
    useStore.getState().mutate((p) => void applySuggestions(p, chosen), undefined, chosen.length === 1 ? `Set status of ${chosen[0].name}` : 'Apply engine status suggestions')
  const dismiss = (chosen: StatusSuggestion[]) => useStore.getState().mutate((p) => dismissSuggestions(p, chosen), undefined, 'Dismiss engine status suggestions')
  const where = (s: { docId: string; sectionId: string }) => `${getModule(s.docId)?.title ?? s.docId} › ${s.sectionId}`
  return (
    <section aria-label="Status suggestions" className="engine-map engine-status">
      <strong>Status suggestions from {reportLabel(report)}</strong>
      {suggestions.length > 0 && (
        <>
          <p className="muted">The engine only suggests; nothing changes until you accept. Dismissed ones come back with the next report only if still true.</p>
          <table>
            <thead>
              <tr>
                <th scope="col">Entry</th>
                <th scope="col">Status</th>
                <th scope="col">Why</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.id}>
                  <th scope="row">
                    {s.name} <span className="muted">({where(s)})</span>
                  </th>
                  <td>
                    {s.from || '—'} → <strong>{s.to}</strong>
                  </td>
                  <td>{s.reason}</td>
                  <td className="num">
                    <button className="small" aria-label={`Accept ${s.name}: ${s.to}`} onClick={() => accept([s])}>Accept</button>{' '}
                    <button className="ghost small" aria-label={`Dismiss ${s.name}: ${s.to}`} onClick={() => dismiss([s])}>Dismiss</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ margin: 0 }}>
            <button onClick={() => accept(suggestions)}>Accept all ({suggestions.length})</button>
            <button className="ghost" onClick={() => dismiss(suggestions)}>Dismiss all</button>
          </div>
        </>
      )}
      {warnings.length > 0 && (
        <details open={!suggestions.length}>
          <summary>{countOf(warnings.length, 'entry', 'entries')} marked further in the plan than in the engine</summary>
          <ul className="engine-problems">
            {warnings.map((w) => (
              <li key={`${w.docId}/${w.entityId}`}>
                <span aria-hidden="true">⚠ </span>
                <strong>{w.name}</strong> <span className="muted">({where(w)}, “{w.current}”)</span>: {w.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

/**
 * Live link with the engine (dev server, or a build made with VITE_ENGINE_BRIDGE=1): show a record in the engine, and
 * push the planner's current values into the running game (Unity Play mode; restored when Play mode ends).
 */
function LiveLinkPanel() {
  const project = useProject()
  const [port, setPort] = useState(() => sessionStorage.getItem('hohplan:liveLink:port') ?? '51701')
  const [token, setToken] = useState(() => sessionStorage.getItem('hohplan:liveLink:token') ?? '')
  const [status, setStatus] = useState<LiveStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [record, setRecord] = useState('')
  const records = useMemo(() => buildIR(project).ir.records, [project])
  if (!liveLinkAvailable()) return null
  const link: LiveLink = { port: Number(port), token: token.trim() }
  const remember = () => {
    sessionStorage.setItem('hohplan:liveLink:port', port)
    sessionStorage.setItem('hohplan:liveLink:token', token.trim())
  }
  const connect = async () => {
    remember()
    const r = await liveStatus(link)
    setStatus(r.ok ? r.data : null)
    setMessage(r.ok ? `Connected to ${r.data.engine === 'unity' ? 'Unity' : r.data.engine} ${r.data.engineVersion}${r.data.project ? `, “${r.data.project}”` : ''}: ${countOf(r.data.records, 'record')}, ${r.data.playing ? 'in Play mode' : 'not playing'}.` : r.error)
  }
  const ping = async () => {
    const r = await livePing(link, record)
    setMessage(r.ok ? `Selected ${r.data.key} in the engine (${r.data.assetPath}).` : r.error)
  }
  const push = async () => {
    const r = await livePushValues(link, project)
    setMessage(r.ok ? `${countOf(r.data.applied, 'record')} updated in the running game${r.data.problems.length ? `; ${countOf(r.data.problems.length, 'problem')}: ${r.data.problems.slice(0, 3).join('; ')}` : ''}. Stopping Play mode restores them.` : r.error)
  }
  return (
    <section aria-label="Live link" className="engine-map">
      <strong>Live link</strong>
      <p className="muted">With the engine open and its live link on (Unity: Window ▸ Game Design Planner ▸ Live link), show a record there, or try the planner's current numbers in the running game without exporting. Only 127.0.0.1 is contacted.</p>
      <div className="row" style={{ margin: 0, alignItems: 'center' }}>
        <label className="row" style={{ margin: 0, alignItems: 'center' }}>
          Port
          <input aria-label="Live link port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: 80 }} />
        </label>
        <label className="row" style={{ margin: 0, alignItems: 'center' }}>
          Token
          <input aria-label="Live link token" type="password" value={token} onChange={(e) => setToken(e.target.value)} style={{ width: 200 }} />
        </label>
        <button onClick={() => void connect()} disabled={!token.trim()}>Connect</button>
      </div>
      {status && (
        <div className="row" style={{ margin: 0, alignItems: 'center' }}>
          <select aria-label="Record to show in the engine" value={record} onChange={(e) => setRecord(e.target.value)}>
            <option value="">Choose a record…</option>
            {records.map((r) => (
              <option key={r.plannerId} value={r.plannerId}>{r.key}</option>
            ))}
          </select>
          <button onClick={() => void ping()} disabled={!record}>Show in the engine</button>
          <button onClick={() => void push()}>Push values to Play mode</button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
