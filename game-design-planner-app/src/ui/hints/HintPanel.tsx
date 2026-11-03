import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ruleOf } from '../../core/hints/engine'
import type { Hint } from '../../core/hints/types'
import { makeId } from '../../core/model/project'
import { getModule, getSection } from '../../core/modules/registry'
import { useStore } from '../../core/store/store'
import { useHints, useSnooze } from './useHints'
import { AiPanel } from '../ai/AiPanel'
import { useAiUi } from '../ai/aiStore'
import { useAiSession, useAiSettings } from '../../core/ai/session'

const WIDTH_KEY = 'hohplan:hintWidth'
const ICON = { info: '💡', suggest: '💡', important: '❗' } as const

export function HintCard({ hint, onExplain }: { hint: Hint; onExplain?: (h: Hint) => void }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const snooze = useSnooze((s) => s.snooze)
  const a = hint.action
  const title = hint.title ?? t(hint.titleKey!, hint.params)
  const body = hint.body ?? t(hint.bodyKey!, hint.params)

  const run = () => {
    if (!a) return
    if (a.kind === 'goto') {
      nav(`/doc/${a.docId}${a.sectionId ? `?s=${a.sectionId}` : ''}`)
      return
    }
    const mod = getModule(a.docId)
    const sec = mod && getSection(mod, useStore.getState().project.registry, a.sectionId)
    if (sec?.kind !== 'collection') return
    useStore.getState().mutate((p) => {
      const list = p.documents[a.docId]?.data[a.sectionId]
      if (Array.isArray(list)) list.push({ id: makeId(), name: `New ${sec.singular}`, ...a.init })
    })
    setConfirming(false)
  }

  return (
    <li className={`hint-card ${hint.severity}`} data-testid="hint">
      <strong>{ICON[hint.severity]} {title}</strong>
      <p>{body}</p>
      {confirming ? (
        <div className="hint-actions">
          <span>{t('hints.confirm')}</span>
          <button className="primary" onClick={run}>{t('hints.yes')}</button>
          <button onClick={() => setConfirming(false)}>{t('hints.no')}</button>
        </div>
      ) : (
        <div className="hint-actions">
          {a?.kind === 'goto' && <button onClick={run}>{t('hints.go')}</button>}
          {a?.kind === 'addEntity' && <button onClick={() => setConfirming(true)}>{t('hints.create')}</button>}
          {onExplain && <button onClick={() => onExplain(hint)}>🤖 {t('ai.explain')}</button>}
          <button onClick={() => snooze(hint.id)}>{t('hints.snooze')}</button>
          <button onClick={() => useStore.getState().updateHintPrefs((h) => void (h.dismissed[hint.id] = true))}>{t('hints.dismiss')}</button>
          <button title={t('hints.mute')} onClick={() => useStore.getState().updateHintPrefs((h) => {
            const r = ruleOf(hint.ruleId)
            if (!h.mutedRules.includes(r)) h.mutedRules.push(r)
          })}>🔕</button>
        </div>
      )}
    </li>
  )
}

export function HintPanel({ docId, sectionId }: { docId: string; sectionId?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const { visible, total } = useHints(docId, sectionId)
  const { tab, setTab, explain } = useAiUi()
  const provider = useAiSettings((s) => s.settings.provider)
  const aiReady = useAiSession((s) => s.hasKey[provider])
  const showAi = tab === 'ai'
  const [width, setWidth] = useState(() => Number(localStorage.getItem(WIDTH_KEY)) || 280)
  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    let last = startW
    const move = (ev: PointerEvent) => {
      last = Math.min(Math.max(startW + startX - ev.clientX, 220), Math.round(window.innerWidth * 0.5))
      setWidth(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      localStorage.setItem(WIDTH_KEY, String(last))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [width])
  return (
    <aside className="hint-panel" style={{ width }} aria-live="polite" aria-label={t('hints.panel')}>
      <div className="hint-resize" role="separator" aria-orientation="vertical" onPointerDown={startResize} />
      <div className="hint-head">
        <div className="tabs">
          <button className={!showAi ? 'active' : ''} onClick={() => setTab('hints')}>💡 {t('hints.panel')}{total > 0 && <span className="badge">{total}</span>}</button>
          <button className={showAi ? 'active' : ''} onClick={() => setTab('ai')}>🤖 AI</button>
        </div>
        <button onClick={() => setOpen(!open)}>{open ? t('hints.hide') : t('hints.show')}</button>
      </div>
      {open && showAi && <AiPanel docId={docId} sectionId={sectionId} />}
      {open && !showAi && (
        <>
          {visible.length === 0 && <p className="muted">{t('hints.none')}</p>}
          <ul className="list">{visible.map((h) => <HintCard key={h.id} hint={h} onExplain={aiReady ? explain : undefined} />)}</ul>
          {total > visible.length && <p className="muted">{t('hints.more', { count: total - visible.length })}</p>}
        </>
      )}
    </aside>
  )
}
