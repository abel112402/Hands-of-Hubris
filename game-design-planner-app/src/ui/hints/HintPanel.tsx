import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MAX_ACTIVE_HINTS, ruleOf, splitByScope } from '../../core/hints/engine'
import type { Hint } from '../../core/hints/types'
import { makeId } from '../../core/model/project'
import { getModule, getSection } from '../../core/modules/registry'
import { useStore } from '../../core/store/store'
import { useHints, useSnooze } from './useHints'
import { AiPanel } from '../ai/AiPanel'
import { useAiUi } from '../ai/aiStore'
import { useAiSession, useAiSettings } from '../../core/ai/session'
import { guideOf } from '../../modules/guides'
import { GuidePanel } from '../guides/GuidePanel'
import { Icon } from '../Icon'

const WIDTH_KEY = 'hohplan:hintWidth'
const MIN_WIDTH = 220
const KEY_STEP = 16
/** Whether the "Other planners" group is expanded; collapsed by default. */
const ELSEWHERE_KEY = 'hohplan:hintsElsewhereOpen'

const readFlag = (key: string) => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
const writeFlag = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    /* not remembered */
  }
}
export const SEVERITY_ICON = { info: 'ℹ️', suggest: '💡', important: '❗' } as const
const ICON = SEVERITY_ICON

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
          {a?.kind === 'goto' && <button className="primary" onClick={run}>{t('hints.go')}</button>}
          {a?.kind === 'addEntity' && <button className="primary" onClick={() => setConfirming(true)}>{t('hints.create')}</button>}
          {onExplain && <button onClick={() => onExplain(hint)}><Icon name="sparkle" /> {t('ai.explain')}</button>}
          {/* Secondary actions live in a labelled menu, so each card has one obvious next step. */}
          <details className="menu hint-more">
            <summary title={t('hints.moreActions')} aria-label={t('hints.moreActions')}><Icon name="more" /></summary>
            <div>
              <button onClick={() => snooze(hint.id)}>{t('hints.snooze')}</button>
              <button onClick={() => useStore.getState().updateHintPrefs((h) => void (h.dismissed[hint.id] = true))}>{t('hints.dismiss')}</button>
              <button onClick={() => useStore.getState().updateHintPrefs((h) => {
                const r = ruleOf(hint.ruleId)
                if (!h.mutedRules.includes(r)) h.mutedRules.push(r)
              })}>{t('hints.mute')}</button>
            </div>
          </details>
        </div>
      )}
    </li>
  )
}

export function HintPanel({ docId, sectionId }: { docId: string; sectionId?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const { all } = useHints(docId, sectionId)
  const { here, elsewhere } = splitByScope(all, { docId })
  const [showAll, setShowAll] = useState(false)
  const shownHere = showAll ? here : here.slice(0, MAX_ACTIVE_HINTS)
  const [elsewhereOpen, setElsewhereOpen] = useState(() => readFlag(ELSEWHERE_KEY))
  const rememberElsewhere = (o: boolean) => {
    setElsewhereOpen(o)
    writeFlag(ELSEWHERE_KEY, o)
  }
  const { tab, setTab, explain } = useAiUi()
  const provider = useAiSettings((s) => s.settings.provider)
  const aiReady = useAiSession((s) => s.hasKey[provider])
  const guide = guideOf(docId)
  const showGuide = tab === 'guide' && !!guide
  const showAi = tab === 'ai'
  const [width, setWidth] = useState(() => Number(localStorage.getItem(WIDTH_KEY)) || 280)
  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    let last = startW
    const move = (ev: PointerEvent) => {
      last = Math.min(Math.max(startW + startX - ev.clientX, MIN_WIDTH), Math.round(window.innerWidth * 0.5))
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
  const maxWidth = Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.5))
  const resizeByKey = (e: React.KeyboardEvent) => {
    // The panel sits on the right, so ArrowLeft widens it, like dragging the handle left.
    const next =
      e.key === 'ArrowLeft' ? width + KEY_STEP
      : e.key === 'ArrowRight' ? width - KEY_STEP
      : e.key === 'Home' ? MIN_WIDTH
      : e.key === 'End' ? maxWidth
      : null
    if (next === null) return
    e.preventDefault()
    const w = Math.min(Math.max(next, MIN_WIDTH), maxWidth)
    setWidth(w)
    localStorage.setItem(WIDTH_KEY, String(w))
  }
  return (
    <aside className="hint-panel" style={{ width }} aria-label={t('hints.panel')}>
      <div
        className="hint-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('hints.resize')}
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={resizeByKey}
      />
      <span className="sr-only" role="status">{t('hints.thisPageCount', { count: here.length })}</span>
      <div className="hint-head">
        <div className="tabs">
          <button
            className={!showAi && !showGuide ? 'active' : ''}
            title={t('hints.thisPageCount', { count: here.length })}
            onClick={() => setTab('hints')}
          >
            <Icon name="bulb" /> {t('hints.panel')}{here.length > 0 && <span className="badge" aria-hidden="true">{here.length}</span>}
          </button>
          {guide && <button className={showGuide ? 'active' : ''} onClick={() => setTab('guide')}><Icon name="compass" /> {t('guide.tab')}</button>}
          <button className={showAi ? 'active' : ''} onClick={() => setTab('ai')}><Icon name="sparkle" /> AI</button>
        </div>
        <button
          className="hint-toggle"
          aria-expanded={open}
          aria-label={open ? t('hints.hide') : t('hints.show')}
          title={open ? t('hints.hide') : t('hints.show')}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'chevronRight' : 'chevronLeft'} />
        </button>
      </div>
      {open && showAi && <AiPanel docId={docId} sectionId={sectionId} />}
      {open && showGuide && <GuidePanel docId={docId} guide={guide} />}
      {open && !showAi && !showGuide && (
        <>
          <h4 className="hint-group">{t('hints.thisPage')}</h4>
          {here.length === 0 && <p className="muted">{t('hints.allClear')}</p>}
          <ul className="list">{shownHere.map((h) => <HintCard key={h.id} hint={h} onExplain={aiReady ? explain : undefined} />)}</ul>
          {here.length > MAX_ACTIVE_HINTS && (
            <button className="small" onClick={() => setShowAll(!showAll)}>
              {showAll ? t('hints.showLess') : t('hints.showMore', { count: here.length - MAX_ACTIVE_HINTS })}
            </button>
          )}
          {elsewhere.length > 0 && (
            <details className="hint-elsewhere" open={elsewhereOpen} onToggle={(e) => rememberElsewhere((e.target as HTMLDetailsElement).open)}>
              <summary>{t('hints.otherPlanners', { count: elsewhere.length })}</summary>
              <ul className="list">{elsewhere.map((h) => <HintCard key={h.id} hint={h} onExplain={aiReady ? explain : undefined} />)}</ul>
            </details>
          )}
        </>
      )}
    </aside>
  )
}
