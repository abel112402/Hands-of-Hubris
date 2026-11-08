import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { buildContext, type ContextScope } from '../../core/ai/context'
import { buildIndex, loadEmbeddedDocs, projectDocs, searchIndex, type DocFile } from '../../core/ai/docsIndex'
import { parseFindings, type Finding } from '../../core/ai/findings'
import { TASKS, buildPrompt, type TaskId } from '../../core/ai/prompts'
import { applyDiff, buildDiff, parseProposal, type DiffItem } from '../../core/ai/proposals'
import { currentConfig, estimateRequest, runAi, type RunHandle } from '../../core/ai/run'
import { useAiSession } from '../../core/ai/session'
import { AiError, type ChatMessage } from '../../core/ai/types'
import { MODULES, getModule, getSection, getSections } from '../../core/modules/registry'
import { entityLabel } from '../../core/references/refs'
import { makeId } from '../../core/model/project'
import { looksLikeSecret } from '../../core/ai/security'
import { useStore } from '../../core/store/store'
import { useAiUi } from './aiStore'

type Prepared = { system: string; messages: ChatMessage[]; json: boolean; payload: string; sources: string[] }
type Scope = ContextScope['mode'] | 'none'
const fmt = (v: unknown) => {
  const s = v === undefined ? '∅' : typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 400 ? s.slice(0, 400) + '…' : s
}

let embeddedIndex: Promise<DocFile[]> | null = null

const NO_TEMPLATES: never[] = []

export function AiPanel({ docId, sectionId }: { docId: string; sectionId?: string }) {
  const { t, i18n } = useTranslation()
  const project = useStore((s) => s.project)
  const hasKey = useAiSession((s) => s.hasKey)
  const { chat, setChat, hintRequest, folderDocs } = useAiUi()
  const cfg = currentConfig()

  const [task, setTask] = useState<TaskId>('chat')
  const [scope, setScope] = useState<Scope>('section')
  const [docIds, setDocIds] = useState<string[]>([])
  const [includeRef, setIncludeRef] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [count, setCount] = useState(3)
  const [mode, setMode] = useState<'expand' | 'rewrite' | 'translate'>('expand')
  const [toLang, setToLang] = useState<'en' | 'hu'>('en')
  const [entityId, setEntityId] = useState('')
  const [src, setSrc] = useState({ embedded: true, project: true, folder: true })
  const [richTarget, setRichTarget] = useState('')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [showPayload, setShowPayload] = useState(false)
  const [override, setOverride] = useState(false)
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [diff, setDiff] = useState<DiffItem[] | null>(null)
  const [summary, setSummary] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [applied, setApplied] = useState('')
  const run = useRef<RunHandle | null>(null)

  const mod = getModule(docId)
  const sec = mod ? getSection(mod, project.registry, sectionId ?? '') : undefined
  const entities: any[] = sec?.kind === 'collection' ? ((project.documents[docId]?.data[sec.id] as any[]) ?? []) : []
  const richSections = mod ? getSections(mod, project.registry).filter((s) => s.kind === 'richtext') : []
  const lang: 'en' | 'hu' = cfg.settings.promptLanguage === 'auto' ? (i18n.language === 'hu' ? 'hu' : 'en') : cfg.settings.promptLanguage

  const resetResult = () => { setPrepared(null); setOutput(''); setError(''); setDiff(null); setFindings(null); setSources([]); setApplied('') }
  // Any change of inputs invalidates the previewed payload, so what is sent is always what was shown.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setPrepared(null) }, [task, scope, docIds, includeRef, instruction, count, mode, toLang, entityId, src, docId, sectionId])
  useEffect(() => { if (hintRequest) { setTask('hint'); resetResult() } }, [hintRequest])
  useEffect(() => {
    const defaults: Record<TaskId, Scope> = { chat: 'section', generate: 'document', rewrite: 'section', review: 'document', formula: 'document', summary: 'document', docs: 'none', hint: 'section' }
    setScope(defaults[task])
  }, [task])
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => () => run.current?.abort(), [])

  const needsSection = task === 'generate' || task === 'rewrite' || task === 'formula'
  const sectionOk =
    task === 'hint' ? !!hintRequest : !needsSection || (task === 'formula' ? sec?.kind === 'formulas' : sec?.kind === 'collection')

  const prepare = async () => {
    setError('')
    try {
      let context: string | undefined
      if (scope !== 'none' && task !== 'docs') {
        context = buildContext(project, { mode: scope, docId, sectionId, docIds, includeReferenced: includeRef }, cfg.settings.maxContextChars).text
      }
      let docsExcerpts: string | undefined
      let used: string[] = []
      if (task === 'docs') {
        embeddedIndex ??= loadEmbeddedDocs()
        const files = [...(src.embedded ? await embeddedIndex : []), ...(src.project ? projectDocs(project) : []), ...(src.folder ? folderDocs : [])]
        const hits = searchIndex(buildIndex(files), instruction, 6)
        used = hits.map((h, i) => `[S${i + 1}] ${h.source} › ${h.heading}`)
        docsExcerpts = hits.map((h, i) => `[S${i + 1}] (${h.source} › ${h.heading})\n${h.text.slice(0, 1800)}`).join('\n\n')
        if (!hits.length) throw new AiError('invalid', t('ai.noDocsHits'))
      }
      const hintData = task === 'hint' && hintRequest ? JSON.stringify({ rule: hintRequest.ruleId, severity: hintRequest.severity, target: hintRequest.target, text: hintRequest.title ?? t(hintRequest.titleKey ?? '', hintRequest.params ?? {}), details: hintRequest.body ?? t(hintRequest.bodyKey ?? '', hintRequest.params ?? {}) }) : undefined
      const target =
        task === 'rewrite'
          ? entityId
            ? `entry id "${entityId}" in section "${sectionId}" of document "${docId}"`
            : `all entries of section "${sectionId}" in document "${docId}"`
          : sec
            ? `section "${sectionId}" of document "${docId}"`
            : undefined
      const p = buildPrompt({ task, language: lang, instruction, context, docsExcerpts, hintData, count, rewriteMode: mode, translateTo: toLang, target })
      const history = task === 'chat' ? chat.slice(-10) : []
      const messages: ChatMessage[] = [...history, { role: 'user', content: p.user }]
      setPrepared({ system: p.system, messages, json: p.json, payload: `${p.system}\n\n---\n\n${messages.map((m) => `[${m.role}]\n${m.content}`).join('\n\n')}`, sources: used })
    } catch (e) {
      setError(e instanceof AiError ? e.message : String(e))
    }
  }

  const est = useMemo(() => (prepared ? estimateRequest({ system: prepared.system, messages: prepared.messages, json: prepared.json }) : null), [prepared])

  const finish = async (text: string, p: Prepared, retried: boolean): Promise<void> => {
    const proposalTask = task === 'generate' || task === 'rewrite' || task === 'formula'
    if (proposalTask) {
      const r = parseProposal(text)
      if (r.ok) {
        const d = buildDiff(useStore.getState().project, r.proposal)
        setDiff(d); setSummary(r.proposal.summary)
        setPicked(new Set(d.filter((x) => !x.error).map((x) => x.index)))
        return
      }
      if (!retried) return retry(text, p, r.error)
      setError(`${t('ai.invalidAnswer')} ${r.error}`)
    } else if (task === 'review') {
      const r = parseFindings(useStore.getState().project, text)
      if (r.ok) { setFindings(r.findings); return }
      if (!retried) return retry(text, p, r.error)
      setError(`${t('ai.invalidAnswer')} ${r.error}`)
    } else if (task === 'chat') {
      setChat([...chat.slice(-10), { role: 'user', content: instruction }, { role: 'assistant', content: text }])
    }
  }

  const retry = async (bad: string, p: Prepared, why: string) => {
    const messages: ChatMessage[] = [...p.messages, { role: 'assistant', content: bad }, { role: 'user', content: `Your answer was invalid (${why}). Reply again with ONLY the corrected JSON object.` }]
    const h = runAi({ system: p.system, messages, json: true }, setOutput, { overrideBudget: override })
    run.current = h
    const r = await h.done
    await finish(r.text, { ...p, messages }, true)
  }

  const send = async () => {
    if (!prepared) return
    resetResultKeep()
    setBusy(true)
    try {
      const h = runAi({ system: prepared.system, messages: prepared.messages, json: prepared.json }, setOutput, { overrideBudget: override })
      run.current = h
      const r = await h.done
      setSources(prepared.sources)
      await finish(r.text, prepared, false)
    } catch (e) {
      setError(e instanceof AiError ? `${t(`ai.errors.${e.code}`)} ${e.code === 'budget' ? '' : e.message}` : String(e))
    } finally {
      setBusy(false)
      run.current = null
    }
  }
  function resetResultKeep() { setOutput(''); setError(''); setDiff(null); setFindings(null); setApplied('') }

  const apply = () => {
    if (!diff) return
    const r = applyDiff(diff, picked, { provider: cfg.provider, model: cfg.model })
    setApplied(t('ai.applied', { count: r.applied, skipped: r.skipped.length }) + (r.skipped.some((s) => s.reason === 'stale') ? ` ${t('ai.stale')}` : ''))
    setDiff(null)
  }

  const insertSummary = () => {
    const rt = richSections.find((s) => s.id === richTarget) ?? richSections[0]
    if (!rt || !output.trim()) return
    const d = buildDiff(useStore.getState().project, { summary: '', ops: [{ op: 'appendRichtext', docId, sectionId: rt.id, text: output.slice(0, 20000) }] })
    setDiff(d); setPicked(new Set([0])); setSummary('')
  }

  if (!hasKey[cfg.provider])
    return (
      <div className="ai-panel">
        <p>{t('ai.noKey')}</p>
        <Link to="/settings/ai">{t('ai.openSettings')}</Link>
      </div>
    )

  const blocked = !!est && !est.budget.ok && !override
  return (
    <div className="ai-panel">
      <div className="ai-row muted">{cfg.provider} · {cfg.model} · <Link to="/settings/ai">{t('ai.settings')}</Link></div>
      <select aria-label={t('ai.task')} value={task} onChange={(e) => { setTask(e.target.value as TaskId); resetResult() }}>
        {TASKS.map((x) => <option key={x} value={x}>{t(`ai.tasks.${x}`)}</option>)}
      </select>
      {needsSection && !sectionOk && <p className="error-text">{t(task === 'formula' ? 'ai.needFormulaSection' : 'ai.needCollection')}</p>}

      {task !== 'docs' && (
        <fieldset className="ai-fieldset">
          <legend>{t('ai.context')}</legend>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="none">{t('ai.scope.none')}</option>
            <option value="section">{t('ai.scope.section')}</option>
            <option value="document">{t('ai.scope.document')}</option>
            <option value="documents">{t('ai.scope.documents')}</option>
            <option value="project">{t('ai.scope.project')}</option>
          </select>
          {scope === 'documents' && (
            <div className="ai-docs">
              {MODULES.filter((m) => project.documents[m.id]).map((m) => (
                <label key={m.id}><input type="checkbox" checked={docIds.includes(m.id)} onChange={(e) => setDocIds(e.target.checked ? [...docIds, m.id] : docIds.filter((x) => x !== m.id))} />{m.title}</label>
              ))}
            </div>
          )}
          {scope !== 'none' && scope !== 'project' && <label><input type="checkbox" checked={includeRef} onChange={(e) => setIncludeRef(e.target.checked)} />{t('ai.includeRef')}</label>}
        </fieldset>
      )}

      {task === 'docs' && (
        <fieldset className="ai-fieldset">
          <legend>{t('ai.docSources')}</legend>
          <label><input type="checkbox" checked={src.embedded} onChange={(e) => setSrc({ ...src, embedded: e.target.checked })} />{t('ai.srcEmbedded')}</label>
          <label><input type="checkbox" checked={src.project} onChange={(e) => setSrc({ ...src, project: e.target.checked })} />{t('ai.srcProject')}</label>
          <label><input type="checkbox" checked={src.folder} disabled={!folderDocs.length} onChange={(e) => setSrc({ ...src, folder: e.target.checked })} />{t('ai.srcFolder', { count: folderDocs.length })}</label>
        </fieldset>
      )}

      {task === 'generate' && <label className="ai-row">{t('ai.count')} <input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} /></label>}
      {task === 'rewrite' && (
        <div className="ai-row">
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="expand">{t('ai.mode.expand')}</option><option value="rewrite">{t('ai.mode.rewrite')}</option><option value="translate">{t('ai.mode.translate')}</option>
          </select>
          {mode === 'translate' && <select value={toLang} onChange={(e) => setToLang(e.target.value as 'en' | 'hu')}><option value="en">EN</option><option value="hu">HU</option></select>}
          <select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            <option value="">{t('ai.allEntries')}</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{entityLabel(e)}</option>)}
          </select>
        </div>
      )}

      <textarea rows={4} value={instruction} placeholder={t(`ai.placeholder.${task}`)} onChange={(e) => setInstruction(e.target.value)} />
      <Templates onPick={(text) => setInstruction((i) => (i ? `${i}\n${text}` : text))} text={instruction} />

      <div className="ai-row">
        <button onClick={() => void prepare()} disabled={busy || !sectionOk}>{t('ai.preview')}</button>
        {busy ? <button className="danger" onClick={() => run.current?.abort()}>{t('ai.cancel')}</button> : <button className="primary" disabled={!prepared || blocked} onClick={() => void send()}>{t('ai.send')}</button>}
        {task === 'chat' && chat.length > 0 && <button onClick={() => setChat([])}>{t('ai.clearChat')}</button>}
      </div>

      {prepared && est && (
        <div className="ai-preview">
          <div>{t('ai.estimate', { input: est.inTokens, output: est.maxOut })}{est.cost !== null ? ` · ≈ $${est.cost.toFixed(4)}` : ` · ${t('ai.noPrice')}`}</div>
          {!est.budget.ok && (
            <div className="error-text">
              {t('ai.budgetExceeded')} <label><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />{t('ai.override')}</label>
            </div>
          )}
          <button className="small" onClick={() => setShowPayload(!showPayload)}>{showPayload ? t('ai.hidePayload') : t('ai.showPayload')}</button>
          {showPayload && <pre className="ai-payload">{prepared.payload}</pre>}
        </div>
      )}

      {task === 'chat' && chat.map((m, i) => <div key={i} className={`ai-msg ${m.role}`}><b>{m.role === 'user' ? t('ai.you') : '🤖'}</b><div className="ai-text">{m.content}</div></div>)}
      {error && <p className="error-text" role="alert">{error}</p>}
      {(busy || (output && !diff && !findings && task !== 'chat')) && <div className="ai-msg assistant"><b>🤖 AI</b><div className="ai-text">{output}</div></div>}
      {sources.length > 0 && <ul className="ai-sources">{sources.map((s) => <li key={s}>{s}</li>)}</ul>}

      {task === 'summary' && output && !busy && richSections.length > 0 && (
        <div className="ai-row">
          <select value={richTarget} onChange={(e) => setRichTarget(e.target.value)}>{richSections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
          <button onClick={insertSummary}>{t('ai.insert')}</button>
        </div>
      )}

      {findings && (
        <ul className="ai-findings">
          {findings.length === 0 && <li className="muted">{t('ai.noFindings')}</li>}
          {findings.map((f, i) => (
            <li key={i} className={f.severity}>
              <span className={`pill ${f.severity === 'error' ? 'important' : f.severity === 'warning' ? 'suggest' : ''}`}>{f.severity}</span>{' '}
              <Link to={`/doc/${f.docId}${f.sectionId ? `?s=${f.sectionId}` : ''}`}>{getModule(f.docId)?.title}</Link>
              <div className="ai-text">{f.message}</div>
            </li>
          ))}
        </ul>
      )}

      {diff && (
        <div className="ai-diff">
          <strong>{t('ai.proposal')}</strong> <span className="muted">🤖 {summary}</span>
          <ul className="list">
            {diff.map((d) => (
              <li key={d.index} className={d.error ? 'bad' : ''}>
                <input type="checkbox" disabled={!!d.error} checked={picked.has(d.index)} aria-label={d.title}
                  onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(d.index); else n.delete(d.index); setPicked(n) }} />
                <div>
                  <div><b>{t(`ai.kind.${d.kind}`)}</b> {d.title}{d.fieldLabel ? ` · ${d.fieldLabel}` : ''}</div>
                  {d.before !== undefined && <div className="diff-old">− {fmt(d.before)}</div>}
                  {d.after !== undefined && <div className="diff-new">+ {fmt(d.after)}</div>}
                  {d.warnings.map((w) => <div key={w} className="muted">⚠ {w}</div>)}
                  {d.error && <div className="error-text">✖ {d.error}</div>}
                </div>
              </li>
            ))}
          </ul>
          <div className="ai-row">
            <button className="primary" disabled={picked.size === 0} onClick={apply}>{t('ai.apply', { n: picked.size })}</button>
            <button onClick={() => setDiff(null)}>{t('ai.discard')}</button>
          </div>
        </div>
      )}
      {applied && <p className="status">{applied}</p>}
    </div>
  )
}

function Templates({ onPick, text }: { onPick: (t: string) => void; text: string }) {
  const { t } = useTranslation()
  const storedTemplates = useStore((s) => s.project.meta.aiTemplates)
  const templates = storedTemplates ?? NO_TEMPLATES
  const [name, setName] = useState('')
  const save = () => {
    if (!name.trim() || !text.trim() || looksLikeSecret(text) || looksLikeSecret(name)) return
    useStore.getState().mutate((p) => {
      p.meta.aiTemplates = [...(p.meta.aiTemplates ?? []), { id: makeId(), name: name.trim().slice(0, 80), text: text.slice(0, 4000) }]
    })
    setName('')
  }
  return (
    <div className="ai-row">
      {templates.length > 0 && (
        <select value="" aria-label={t('ai.templates')} onChange={(e) => { const tp = templates.find((x) => x.id === e.target.value); if (tp) onPick(tp.text) }}>
          <option value="">{t('ai.templates')}…</option>
          {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
      <input placeholder={t('ai.templateName')} value={name} onChange={(e) => setName(e.target.value)} />
      <button className="small" onClick={save} disabled={!name.trim() || !text.trim()}>{t('ai.saveTemplate')}</button>
    </div>
  )
}
