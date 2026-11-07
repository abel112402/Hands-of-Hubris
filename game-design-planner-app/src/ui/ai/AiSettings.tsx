import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { readLedger, resetLedger } from '../../core/ai/budget'
import { readMarkdownFiles } from '../../core/ai/docsIndex'
import { PROVIDERS } from '../../core/ai/providers'
import { fetchModels } from '../../core/ai/run'
import { isValidModelId } from '../../core/ai/security'
import { priceKey, useAiSession, useAiSettings } from '../../core/ai/session'
import { AiError, PROVIDER_IDS, type ProviderId } from '../../core/ai/types'
import { useStore } from '../../core/store/store'
import { useAiUi } from './aiStore'

const numOr0 = (v: string) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0 }

const NO_TEMPLATES: never[] = []

export function AiSettings() {
  const { t } = useTranslation()
  const { settings, update } = useAiSettings()
  const { hasKey, models, setKey, clearKey, clearAll } = useAiSession()
  const { folderDocs, setFolderDocs } = useAiUi()
  const storedTemplates = useStore((s) => s.project.meta.aiTemplates)
  const templates = storedTemplates ?? NO_TEMPLATES
  const keyInput = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [ledger, setLedger] = useState(readLedger())
  const p: ProviderId = settings.provider
  const model = settings.models[p] || PROVIDERS[p].defaultModel
  const price = settings.prices[priceKey(p, model)] ?? { input: 0, output: 0 }

  const saveKey = () => {
    const el = keyInput.current
    if (!el) return
    try {
      setKey(p, el.value)
      el.value = ''
      setMsg(t('ai.keySaved'))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }
  const refresh = async () => {
    setBusy(true)
    try {
      const list = await fetchModels(p)
      setMsg(t('ai.modelsLoaded', { count: list.length }))
    } catch (e) {
      setMsg(e instanceof AiError ? `${t(`ai.errors.${e.code}`)} ${e.message}` : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>{t('ai.settingsTitle')}</h1>
      <div className="banner">{t('ai.securityNote')}</div>

      <h2>{t('ai.provider')}</h2>
      <div className="row">
        <select value={p} onChange={(e) => update((s) => void (s.provider = e.target.value as ProviderId))}>
          {PROVIDER_IDS.map((id) => <option key={id} value={id}>{PROVIDERS[id].label}</option>)}
        </select>
        <form className="row" onSubmit={(e) => { e.preventDefault(); saveKey() }} autoComplete="off">
          <input ref={keyInput} type="password" name="ai-api-key" autoComplete="off" spellCheck={false} placeholder={hasKey[p] ? '•••••••• (set for this session)' : t('ai.keyPlaceholder')} />
          <button type="submit" className="primary">{t('ai.saveKey')}</button>
          <button type="button" className="danger" disabled={!hasKey[p]} onClick={() => clearKey(p)}>{t('ai.clearKey')}</button>
          <button type="button" className="danger" onClick={clearAll}>{t('ai.clearAllKeys')}</button>
        </form>
      </div>
      {msg && <p role="status">{msg}</p>}

      <h2>{t('ai.model')}</h2>
      <div className="row">
        {(models[p]?.length ?? 0) > 0 && (
          <select value={model} onChange={(e) => update((s) => void (s.models[p] = e.target.value))}>
            {!models[p]!.some((m) => m.id === model) && <option value={model}>{model}</option>}
            {models[p]!.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}
        <input value={model} aria-label={t('ai.modelName')} onChange={(e) => { if (e.target.value === '' || isValidModelId(e.target.value)) update((s) => void (s.models[p] = e.target.value)) }} />
        <button disabled={!hasKey[p] || busy} onClick={() => void refresh()}>{t('ai.refreshModels')}</button>
      </div>

      <h2>{t('ai.params')}</h2>
      <label className="row">{t('ai.maxOutput')} <input type="number" min={64} max={64000} value={settings.maxOutputTokens} onChange={(e) => update((s) => void (s.maxOutputTokens = Number(e.target.value) || 4096))} /></label>
      <label className="row">{t('ai.timeout')} <input type="number" min={10} max={600} value={settings.timeoutSec} onChange={(e) => update((s) => void (s.timeoutSec = Number(e.target.value) || 120))} /></label>
      <label className="row">{t('ai.maxContext')} <input type="number" min={2000} max={400000} value={settings.maxContextChars} onChange={(e) => update((s) => void (s.maxContextChars = Number(e.target.value) || 60000))} /></label>
      <label className="row">{t('ai.promptLang')}
        <select value={settings.promptLanguage} onChange={(e) => update((s) => void (s.promptLanguage = e.target.value as 'auto' | 'en' | 'hu'))}>
          <option value="auto">Auto</option><option value="en">English</option><option value="hu">Magyar</option>
        </select>
      </label>

      <h2>{t('ai.prices')} ({model})</h2>
      <div className="row">
        <label>{t('ai.priceIn')} <input type="number" min={0} step="any" value={price.input} onChange={(e) => update((s) => void (s.prices[priceKey(p, model)] = { input: numOr0(e.target.value), output: price.output }))} /></label>
        <label>{t('ai.priceOut')} <input type="number" min={0} step="any" value={price.output} onChange={(e) => update((s) => void (s.prices[priceKey(p, model)] = { input: price.input, output: numOr0(e.target.value) }))} /></label>
      </div>

      <h2>{t('ai.limits')}</h2>
      <p className="muted">{t('ai.limitsHelp')}</p>
      {(['dayTokens', 'monthTokens', 'dayCost', 'monthCost'] as const).map((k) => (
        <label className="row" key={k}>{t(`ai.limit.${k}`)}
          <input type="number" min={0} step="any" value={settings.limits[k]} onChange={(e) => update((s) => void (s.limits[k] = numOr0(e.target.value)))} />
        </label>
      ))}
      <p>{t('ai.usage', { dt: ledger.dayTokens, mt: ledger.monthTokens, dc: ledger.dayCost.toFixed(4), mc: ledger.monthCost.toFixed(4) })}
        {' '}<button onClick={() => { resetLedger(); setLedger(readLedger()) }}>{t('ai.resetUsage')}</button></p>

      <h2>{t('ai.docsFolder')}</h2>
      <p className="muted">{t('ai.docsFolderHelp')}</p>
      <div className="row">
        <input type="file" multiple accept=".md" {...({ webkitdirectory: '', directory: '' } as object)}
          onChange={(e) => void readMarkdownFiles([...(e.target.files ?? [])]).then(setFolderDocs)} />
        <span>{t('ai.docsLoaded', { count: folderDocs.length })}</span>
        {folderDocs.length > 0 && <button onClick={() => setFolderDocs([])}>{t('ai.clearDocs')}</button>}
      </div>

      <h2>{t('ai.templates')}</h2>
      <ul className="list">
        {templates.length === 0 && <li className="muted">{t('ai.noTemplates')}</li>}
        {templates.map((x) => (
          <li key={x.id}><b>{x.name}</b> <span className="muted">{x.text.slice(0, 80)}</span><span className="spacer" />
            <button className="danger small" onClick={() => useStore.getState().mutate((pr) => void (pr.meta.aiTemplates = (pr.meta.aiTemplates ?? []).filter((y) => y.id !== x.id)))}>{t('hints.settings.remove')}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
