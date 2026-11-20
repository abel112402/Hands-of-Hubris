import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MAX_ACTIVE_HINTS, ruleOf, splitByScope } from '../../core/hints/engine'
import type { Hint } from '../../core/hints/types'
import { makeId } from '../../core/model/project'
import { getModule, getSection } from '../../core/modules/registry'
import { useStore } from '../../core/store/store'
import { useHints, useSnooze } from './useHints'
import { Flavor, useFlavor } from '../flavor/Flavor'
import { Mascot } from '../mascots/Mascot'
import { hintFlavorKey } from '../../core/flavor/pick'
import { costumeFor } from '../../core/mascots/cast'
import { AiPanel } from '../ai/AiPanel'
import { useAiUi } from '../ai/aiStore'
import { useAiSession, useAiSettings } from '../../core/ai/session'
import { guideOf } from '../../modules/guides'
import { GuidePanel } from '../guides/GuidePanel'
import { Icon } from '../Icon'
import { CountBadge } from '../motion'
import { getUiVersion } from '../../core/uiVersion'
import { entityRoute } from '../../core/palette'

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
/** Phone widths, where the editor layout stacks (matches the 767px breakpoint in styles.css). */
const isNarrow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches
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
  // Hubi's aside, in the costume of the planner the hint is about. No key (user hints) → no aside.
  const aside = useFlavor({ keys: hint.titleKey ? `flavor.hint.${hintFlavorKey(hint.titleKey)}` : [], ctx: hint.id })

  const run = () => {
    if (!a) return
    if (a.kind === 'goto') {
      // v3: a hint about one entry opens that entry's record sheet, not only its section.
      const entity = hint.target.entityId
      const section = a.sectionId ?? hint.target.sectionId
      if (getUiVersion() === 'v3' && entity && section && hint.target.docId === a.docId) nav(entityRoute(a.docId, section, entity))
      else nav(`/doc/${a.docId}${a.sectionId ? `?s=${a.sectionId}` : ''}`)
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
      {/* Built-in hints may have an aside under the same key (hints.<key>.title → flavor.hint.<key>); the body stays the message. */}
      {aside && (
        <p className="flavor hint-aside">
          <Mascot costume={costumeFor(hint.target.docId)} pose="think" size={34} />
          <span>{aside}</span>
        </p>
      )}
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

/**
 * The hints themselves: this page's first, then (folded) those about other planners. Without a page (the v3
 * home) every hint of the project is listed together.
 */
export function HintList({ docId, sectionId }: { docId?: string; sectionId?: string }) {
  const { t } = useTranslation()
  const { all } = useHints(docId, sectionId)
  const { here, elsewhere } = docId ? splitByScope(all, { docId }) : { here: all, elsewhere: [] }
  const [showAll, setShowAll] = useState(false)
  const shownHere = showAll ? here : here.slice(0, MAX_ACTIVE_HINTS)
  const [elsewhereOpen, setElsewhereOpen] = useState(() => readFlag(ELSEWHERE_KEY))
  const rememberElsewhere = (o: boolean) => {
    setElsewhereOpen(o)
    writeFlag(ELSEWHERE_KEY, o)
  }
  const explain = useAiUi((s) => s.explain)
  const provider = useAiSettings((s) => s.settings.provider)
  const aiReady = useAiSession((s) => s.hasKey[provider])
  return (
    <>
      <h4 className="hint-group">{docId ? t('hints.thisPage') : t('hints.projectWide', { count: here.length })}</h4>
      {here.length === 0 && (docId
        ? <><p className="muted">{t('hints.allClear')}</p><Flavor keys="flavor.allClear" ctx={docId} costume={costumeFor(docId)} /></>
        : <p className="muted">{t('hints.none')}</p>)}
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
  )
}

/**
 * Hints, the planner guide and AI for a page, in tabs. Classic: a resizable, collapsible column beside the
 * editor. `embedded`: fills its host, always open, no resize handle or collapse toggle. (The v3 companion shows
 * one tool at a time with `HintList`, `GuidePanel` and `AiPanel` directly.)
 */
export function HintPanel({ docId, sectionId, embedded = false }: { docId: string; sectionId?: string; embedded?: boolean }) {
  const { t } = useTranslation()
  // Below 768px the panel sits under the editor (see styles.css), so it starts collapsed there.
  const [open, setOpen] = useState(() => embedded || !isNarrow())
  const { all } = useHints(docId, sectionId)
  const { here } = splitByScope(all, { docId })
  const { tab, setTab } = useAiUi()
  // Picking a tab on a collapsed panel opens it (on phones it starts collapsed, as a bar under the editor).
  const openTab = (next: typeof tab) => {
    setTab(next)
    setOpen(true)
  }
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
    <aside className={'hint-panel' + (embedded ? ' embedded' : '')} style={embedded ? undefined : { width }} aria-label={t('hints.panel')}>
      {!embedded && <div
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
      />}
      <span className="sr-only" role="status">{t('hints.thisPageCount', { count: here.length })}</span>
      <div className="hint-head">
        <div className="tabs">
          <button
            className={!showAi && !showGuide ? 'active' : ''}
            title={t('hints.thisPageCount', { count: here.length })}
            onClick={() => openTab('hints')}
          >
            <Icon name="bulb" /> {t('hints.panel')}<CountBadge count={here.length} hidden />
          </button>
          {guide && <button className={showGuide ? 'active' : ''} onClick={() => openTab('guide')}><Icon name="compass" /> {t('guide.tab')}</button>}
          <button className={showAi ? 'active' : ''} onClick={() => openTab('ai')}><Icon name="sparkle" /> AI</button>
        </div>
        {!embedded && <button
          className="hint-toggle"
          aria-expanded={open}
          aria-label={open ? t('hints.hide') : t('hints.show')}
          title={open ? t('hints.hide') : t('hints.show')}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'chevronRight' : 'chevronLeft'} />
        </button>}
      </div>
      {open && showAi && <AiPanel docId={docId} sectionId={sectionId} />}
      {open && showGuide && <GuidePanel docId={docId} guide={guide} />}
      {open && !showAi && !showGuide && <HintList docId={docId} sectionId={sectionId} />}
    </aside>
  )
}
