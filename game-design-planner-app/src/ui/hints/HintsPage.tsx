import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultHintPrefs, type DeclarativeHintRule, type HintCondition, type HintSeverity, type HintThresholds } from '../../core/model/types'
import { makeId } from '../../core/model/project'
import { MODULES } from '../../core/modules/registry'
import { sectionsOf } from '../../core/hints/util'
import { useStore } from '../../core/store/store'

const SEVERITIES: HintSeverity[] = ['info', 'suggest', 'important']
const THRESHOLD_KEYS: (keyof HintThresholds)[] = ['outlierIqr', 'kanbanWip', 'sparseRatio', 'minSamples']
const KINDS: HintCondition['kind'][] = ['isEmpty', 'count', 'fieldEmpty', 'fieldCompare']

function condition(kind: HintCondition['kind'], field: string, op: string, value: string): HintCondition {
  const num = Number(value)
  switch (kind) {
    case 'isEmpty': return { kind }
    case 'count': return { kind, op: (op as any) || '>', value: num || 0 }
    case 'fieldEmpty': return { kind, field }
    case 'fieldCompare': return { kind, field, op: (op as any) || '>', value: value !== '' && !Number.isNaN(num) ? num : value }
  }
}

function RuleForm() {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const [doc, setDoc] = useState(MODULES[0].id)
  const sections = sectionsOf(project, doc).filter((s) => s.kind !== 'form' && s.kind !== 'richtext' && s.kind !== 'matrix')
  const [section, setSection] = useState('')
  const [kind, setKind] = useState<HintCondition['kind']>('isEmpty')
  const [field, setField] = useState('')
  const [op, setOp] = useState('>')
  const [value, setValue] = useState('')
  const [severity, setSeverity] = useState<HintSeverity>('suggest')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const sec = section || sections[0]?.id || ''
  const add = () => {
    if (!sec || !title.trim()) return
    const rule: DeclarativeHintRule = { id: makeId(), doc, section: sec, when: condition(kind, field, op, value), severity, title, body }
    useStore.getState().mutate((p) => {
      p.registry.hintRules = [...(p.registry.hintRules ?? []), rule]
    })
    setTitle(''); setBody('')
  }
  return (
    <div className="hint-form">
      <select aria-label={t('hints.settings.doc')} value={doc} onChange={(e) => { setDoc(e.target.value); setSection('') }}>
        {MODULES.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
      </select>
      <select aria-label={t('hints.settings.section')} value={sec} onChange={(e) => setSection(e.target.value)}>
        {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      <select aria-label={t('hints.settings.condition')} value={kind} onChange={(e) => setKind(e.target.value as HintCondition['kind'])}>
        {KINDS.map((k) => <option key={k}>{k}</option>)}
      </select>
      {(kind === 'fieldEmpty' || kind === 'fieldCompare') && <input placeholder={t('hints.settings.field')} value={field} onChange={(e) => setField(e.target.value)} />}
      {(kind === 'count' || kind === 'fieldCompare') && (
        <>
          <select value={op} onChange={(e) => setOp(e.target.value)}>
            {['<', '<=', '>', '>=', '==', '!='].map((o) => <option key={o}>{o}</option>)}
          </select>
          <input placeholder={t('hints.settings.value')} value={value} onChange={(e) => setValue(e.target.value)} />
        </>
      )}
      <select aria-label={t('hints.settings.severity')} value={severity} onChange={(e) => setSeverity(e.target.value as HintSeverity)}>
        {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
      </select>
      <input placeholder={t('hints.settings.ruleTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input placeholder={t('hints.settings.ruleBody')} value={body} onChange={(e) => setBody(e.target.value)} />
      <button className="primary" onClick={add}>{t('hints.settings.addRule')}</button>
    </div>
  )
}

export function HintsPage() {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const prefs = project.meta.hints ?? defaultHintPrefs()
  const set = useStore.getState().updateHintPrefs
  const dismissed = Object.keys(prefs.dismissed).length
  return (
    <div className="page">
      <h1>{t('hints.settings.title')}</h1>
      <label className="row">
        <input type="checkbox" checked={prefs.enabled} onChange={(e) => set((h) => void (h.enabled = e.target.checked))} />
        {t('hints.settings.enabled')}
      </label>
      <label className="row">
        {t('hints.settings.minSeverity')}
        <select value={prefs.minSeverity} onChange={(e) => set((h) => void (h.minSeverity = e.target.value as HintSeverity))}>
          {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <h2>{t('hints.settings.thresholds')}</h2>
      {THRESHOLD_KEYS.map((k) => (
        <label className="row" key={k}>
          {t(`hints.settings.${k}`)}
          <input type="number" step="any" min={0} value={prefs.thresholds[k]}
            onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) set((h) => void (h.thresholds[k] = n)) }} />
        </label>
      ))}
      <h2>{t('hints.settings.muted')}</h2>
      {prefs.mutedRules.length === 0 && <p className="muted">{t('hints.settings.noMuted')}</p>}
      <ul className="list">
        {prefs.mutedRules.map((r) => (
          <li key={r}>{r} <button onClick={() => set((h) => void (h.mutedRules = h.mutedRules.filter((x) => x !== r)))}>{t('hints.settings.unmute')}</button></li>
        ))}
      </ul>
      <button disabled={!dismissed} onClick={() => set((h) => void (h.dismissed = {}))}>{t('hints.settings.resetDismissed', { count: dismissed })}</button>
      <h2>{t('hints.settings.custom')}</h2>
      <ul className="list">
        {(project.registry.hintRules ?? []).map((r) => (
          <li key={r.id}>
            <span className={`pill ${r.severity}`}>{r.severity}</span> {r.doc} › {r.section}: {r.title}{' '}
            <button onClick={() => useStore.getState().mutate((p) => void (p.registry.hintRules = (p.registry.hintRules ?? []).filter((x) => x.id !== r.id)))}>{t('hints.settings.remove')}</button>
          </li>
        ))}
      </ul>
      <RuleForm />
    </div>
  )
}
