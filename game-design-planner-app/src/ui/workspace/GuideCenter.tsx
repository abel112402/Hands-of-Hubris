import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../core/store/store'
import { genreLabel } from '../../core/genre'
import { getModule } from '../../core/modules/registry'
import { groupWalkthrough, textOf } from '../../core/walkthrough/compose'
import { setStepManual, setStepSkipped, type WalkthroughProgress } from '../../core/walkthrough/evaluate'
import { stepLink } from '../../core/walkthrough/project'
import { focusHints, hintsForStep, stepPromptData } from '../../core/walkthrough/focus'
import type { WalkthroughView } from './useWalkthrough'
import type { ComposedStep, StepStatus } from '../../core/walkthrough/types'
import type { Hint } from '../../core/hints/types'
import { HintCard } from '../hints/HintPanel'
import { useProgressLine } from './ProgressPanel'
import { Flavor } from '../flavor/Flavor'
import { useMoments } from '../flavor/moments'
import { useHints } from '../hints/useHints'
import { AiPanel } from '../ai/AiPanel'
import { Icon, type IconName } from '../Icon'
import { prefersMotion, useJustChanged, useNewlyAdded } from '../hooks'
import { Segmented, Tick } from '../motion'

type Tab = 'walkthrough' | 'hints' | 'ai'
const VIEW_KEY = 'hohplan:walkView'
const HINTS_SHOWN = 1

const readView = (): 'guided' | 'checklist' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'checklist' ? 'checklist' : 'guided'
  } catch {
    return 'guided'
  }
}

const STATUS_ICON: Record<StepStatus, ReactNode> = { done: <Tick />, skipped: '–', open: '' }
/** How long the finished step's card lingers while it lifts away (matches .step-hero.leaving). */
const HERO_LEAVE_MS = 180
const justFinished = (prev: StepStatus | undefined, next: StepStatus | undefined) => next === 'done' && prev !== 'done'

function StepActions({ step, status, onAsk, primary }: { step: ComposedStep; status: StepStatus; onAsk: (s: ComposedStep) => void; primary?: boolean }) {
  const { t } = useTranslation()
  const readOnly = useStore((s) => s.readOnly)
  const link = stepLink(step.target)
  const mutate = useStore.getState().mutate
  // Next to the one filled action, the others are quiet ghost buttons.
  const ghost = primary ? 'ghost' : undefined
  return (
    <div className="step-actions">
      {link && <Link className={'button' + (primary ? ' primary' : '')} to={link}>{t('workspace.openPlanner')}</Link>}
      <button className={ghost} onClick={() => onAsk(step)}><Icon name="sparkle" /> {t('workspace.askAi')}</button>
      {status !== 'done' && <button className={ghost} disabled={readOnly} onClick={() => mutate((p) => setStepManual(p, step.id, true))}>{t('workspace.markDone')}</button>}
      {status === 'done' && <button className={ghost} disabled={readOnly} onClick={() => mutate((p) => setStepManual(p, step.id, false))}>{t('workspace.unmark')}</button>}
      {status === 'open' && <button className={ghost} disabled={readOnly} onClick={() => mutate((p) => setStepSkipped(p, step.id, true))}>{t('workspace.skip')}</button>}
      {status === 'skipped' && <button className={ghost} disabled={readOnly} onClick={() => mutate((p) => setStepSkipped(p, step.id, false))}>{t('workspace.unskip')}</button>}
    </div>
  )
}

const STEP_HINTS = 3

/**
 * A hint shown as a note inside a step, not as a card: the step already has its main action.
 * It only gets a link when it points somewhere other than the step's own planner; snoozing and
 * dismissing stay in the Hints tab.
 */
function StepNote({ hint, step }: { hint: Hint; step: ComposedStep }) {
  const { t } = useTranslation()
  const a = hint.action
  const elsewhere = a?.kind === 'goto' && a.docId !== step.target?.docId ? a : undefined
  const mod = elsewhere && getModule(elsewhere.docId)
  return (
    <li className={`step-note ${hint.severity}`} data-testid="hint">
      <strong>{hint.title ?? t(hint.titleKey!, hint.params)}</strong>
      <span className="muted">{hint.body ?? t(hint.bodyKey!, hint.params)}</span>
      {elsewhere && mod && (
        <Link className="step-note-link" to={`/doc/${elsewhere.docId}${elsewhere.sectionId ? `?s=${elsewhere.sectionId}` : ''}`}>
          {t('workspace.openTarget', { title: mod.title })} →
        </Link>
      )}
    </li>
  )
}

/** Hints that belong to this step (its quality gates and its target planner), so problems show where the work is. */
function StepHints({ step }: { step: ComposedStep }) {
  const { t } = useTranslation()
  const hints = hintsForStep(step, useHints().all)
  if (!hints.length) return null
  return (
    <section className="step-hints" aria-label={t('workspace.stepHints')}>
      <h3>{t('workspace.stepHints')} <span className="num">({hints.length})</span></h3>
      <ul className="step-notes">{hints.slice(0, STEP_HINTS).map((h) => <StepNote key={h.id} hint={h} step={step} />)}</ul>
    </section>
  )
}

function Notes({ step }: { step: ComposedStep }) {
  const { i18n } = useTranslation()
  const tips = [...(step.tips ?? []).map((text) => ({ source: '', text })), ...step.notes]
  if (!tips.length) return null
  return (
    <ul className="step-tips">
      {tips.map((n, i) => (
        <li key={i}>{n.source && <strong>{genreLabel(n.source)}: </strong>}{textOf(n.text, i18n.language)}</li>
      ))}
    </ul>
  )
}

function crumb(walk: WalkthroughView['walk'], step: ComposedStep, t: (k: string) => string, lang: string) {
  const chapter = walk.chapters.find((c) => c.id === step.chapter)
  return `${t(`walkthrough.phases.${step.phase}`)} › ${chapter ? textOf(chapter.title, lang) : step.chapter}`
}

/** The step to work on now, with its teaching text and actions. */
function CurrentStep({ view, onAsk }: { view: WalkthroughView; onAsk: (s: ComposedStep) => void }) {
  const { t } = useTranslation()
  const next = view.progress.next
  // Hand-off: when the step changes, the old card stays for a moment and lifts away before the next
  // one rises in. View-only: the store has already moved on, so undo and saving are not delayed.
  const [shown, setShown] = useState(next)
  const [leaving, setLeaving] = useState<ComposedStep | null>(null)
  if (next?.id !== shown?.id) {
    setShown(next)
    setLeaving(shown && prefersMotion() ? shown : null)
  }
  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(() => setLeaving(null), HERO_LEAVE_MS)
    return () => clearTimeout(id)
  }, [leaving])
  if (leaving) {
    // Same content as before, so the card does not change height while it fades.
    return (
      <section key={leaving.id} className="step-hero leaving" data-phase={leaving.phase} aria-hidden="true" inert>
        <HeroBody view={view} step={leaving} onAsk={onAsk} />
      </section>
    )
  }
  const step = next
  if (!step) {
    return (
      <section className="step-hero done" aria-label={t('workspace.currentStep')}>
        <h2>{t('workspace.allDone')}</h2>
        <p className="muted">{t('workspace.allDoneHint')}</p>
      </section>
    )
  }
  return (
    <section key={step.id} className="step-hero" data-phase={step.phase} aria-labelledby="current-step-title">
      <HeroBody view={view} step={step} onAsk={onAsk} titleId="current-step-title" />
    </section>
  )
}

function HeroBody({ view, step, onAsk, titleId }: { view: WalkthroughView; step: ComposedStep; onAsk: (s: ComposedStep) => void; titleId?: string }) {
  const { t, i18n } = useTranslation()
  return (
    <>
      <p className="step-crumb eyebrow"><span className="here-dot" aria-hidden="true" />{t('workspace.nextStep')} · {crumb(view.walk, step, t, i18n.language)} <GenreTags step={step} /></p>
      <h2 id={titleId}>{textOf(step.title, i18n.language)}</h2>
      <p>{textOf(step.body, i18n.language)}</p>
      <Notes step={step} />
      <StepActions step={step} status="open" onAsk={onAsk} primary />
      <StepHints step={step} />
    </>
  )
}

function WalkthroughList({ view, onAsk }: { view: WalkthroughView; onAsk: (s: ComposedStep) => void }) {
  const { t, i18n } = useTranslation()
  const [mode, setMode] = useState(readView)
  const setView = (v: 'guided' | 'checklist') => {
    setMode(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* not remembered */
    }
  }
  const { progress } = view
  const line = useProgressLine(progress)
  // Open/closed per phase and chapter. Untouched ones follow the defaults below, so the open part
  // moves along with the current step; once toggled by hand, the choice sticks for this visit.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const finished = (steps: ComposedStep[]) => steps.filter((s) => progress.status[s.id] !== 'open').length
  const phases = groupWalkthrough(view.walk)
  // The one big moment: a phase that has just been finished gets a short burst on its node.
  const justCompleted = useNewlyAdded(phases.filter((p) => { const s = p.chapters.flatMap((c) => c.steps); return s.length > 0 && finished(s) === s.length }).map((p) => p.phase))
  // The same moment in words: the only aside allowed to skip the rate limit.
  useEffect(() => {
    if (justCompleted.size) useMoments.getState().announce({ keys: 'flavor.phaseDone', ctx: [...justCompleted].join() }, true)
  }, [justCompleted])
  const disclosure = (key: string, byDefault: boolean) => ({
    open: toggled[key] ?? byDefault,
    onToggle: (e: React.SyntheticEvent<HTMLDetailsElement>) => {
      const open = e.currentTarget.open
      if (open !== (toggled[key] ?? byDefault)) setToggled((m) => ({ ...m, [key]: open }))
    },
  })
  return (
    <div className="walk">
      <div className="walk-head">
        <span className="muted">{line}</span>
        <span className="spacer" />
        <Segmented className="view-toggle" role="group" aria-label={t('workspace.viewLabel')}>
          <button aria-pressed={mode === 'guided'} onClick={() => setView('guided')}>{t('workspace.viewGuided')}</button>
          <button aria-pressed={mode === 'checklist'} onClick={() => setView('checklist')}>{t('workspace.viewChecklist')}</button>
        </Segmented>
      </div>
      {/* Journey line: the phase holding the current step is open, finished and future phases fold into one line. */}
      {phases.map((phase) => {
        const steps = phase.chapters.flatMap((c) => c.steps)
        const done = finished(steps)
        const isCurrent = progress.next?.phase === phase.phase
        return (
          <details key={phase.phase} className={`walk-phase${done === steps.length ? ' complete' : ''}${isCurrent ? ' current' : ''}${justCompleted.has(phase.phase) ? ' just-complete' : ''}`} data-phase={phase.phase} {...disclosure(phase.phase, isCurrent)}>
            <summary>
              <span className="walk-phase-node" aria-hidden="true" />
              <h3 id={`phase-${phase.phase}`}>{t(`walkthrough.phases.${phase.phase}`)}</h3>
              <span className="walk-count num">{done}/{steps.length}</span>
            </summary>
            {phase.chapters.map((c) => {
              const cDone = finished(c.steps)
              return (
                <details key={c.id} className={`walk-chapter${cDone === c.steps.length ? ' complete' : ''}`} {...disclosure(`${phase.phase}/${c.id}`, cDone < c.steps.length)}>
                  <summary>
                    <h4>{textOf(c.title, i18n.language)}</h4>
                    <span className="walk-count num">{cDone}/{c.steps.length}</span>
                  </summary>
                  <ol className="walk-steps">
                    {c.steps.map((s) => (
                      <StepRow key={s.id} step={s} progress={progress} detailed={mode === 'guided'} onAsk={onAsk} />
                    ))}
                  </ol>
                </details>
              )
            })}
          </details>
        )
      })}
    </div>
  )
}

/** Which selected genres added or changed the step. */
function GenreTags({ step }: { step: ComposedStep }) {
  const genres = step.sources.filter((s) => s !== 'base')
  if (!genres.length) return null
  return <span className="walk-genres muted">{genres.map(genreLabel).join(' · ')}</span>
}

function StepRow({ step, progress, detailed, onAsk }: { step: ComposedStep; progress: WalkthroughProgress; detailed: boolean; onAsk: (s: ComposedStep) => void }) {
  const { t, i18n } = useTranslation()
  const status = progress.status[step.id]
  const current = progress.next?.id === step.id
  const popped = useJustChanged(status, 700, justFinished)
  const [open, setOpen] = useState(false)
  // The current step is already shown in full in the card above, so it starts collapsed here too.
  const expanded = detailed && open
  const link = stepLink(step.target)
  return (
    <li className={`walk-step ${status}${current ? ' current' : ''}${popped ? ' just-done' : ''}`} data-testid={`walk-step-${step.id}`}>
      <div className="walk-step-head">
        <span className="walk-check" role="img" aria-label={t(`workspace.status.${status}`)}>{STATUS_ICON[status]}</span>
        {detailed ? (
          <button className="link-btn" aria-expanded={expanded} onClick={() => setOpen(!open)}>{textOf(step.title, i18n.language)}</button>
        ) : link ? (
          <Link to={link}>{textOf(step.title, i18n.language)}</Link>
        ) : (
          <span>{textOf(step.title, i18n.language)}</span>
        )}
        {step.optional && <span className="pill">{t('workspace.optional')}</span>}
        <GenreTags step={step} />
      </div>
      {expanded && (
        <div className="walk-step-body">
          <p className="muted">{textOf(step.body, i18n.language)}</p>
          <Notes step={step} />
          <StepActions step={step} status={status} onAsk={onAsk} />
          {status !== 'done' && <StepHints step={step} />}
        </div>
      )}
    </li>
  )
}

/** Project hints, with the current step's hints first. */
function HintsTab({ focus }: { focus?: ComposedStep }) {
  const { t } = useTranslation()
  const visible = focusHints(useHints().visible, focus)
  const [all, setAll] = useState(false)
  const shown = all ? visible : visible.slice(0, HINTS_SHOWN)
  if (!visible.length) return <><p className="muted">{t('hints.none')}</p><Flavor keys="flavor.noHints" /></>
  return (
    <section className="next-steps" aria-label={t('hints.nextSteps')}>
      <ul className="list">{shown.map((h) => <HintCard key={h.id} hint={h} />)}</ul>
      {visible.length > HINTS_SHOWN && (
        <button className="small" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? t('hints.showLess') : t('hints.showMore', { count: visible.length - HINTS_SHOWN })}
        </button>
      )}
    </section>
  )
}

/**
 * Center pane: Walkthrough, project Hints and AI as tabs. The Walkthrough tab leads with the step to
 * do now (after the optional `setup` card, e.g. choosing genres), then the full journey.
 */
export function GuideCenter({ view, setup }: { view: WalkthroughView; setup?: ReactNode }) {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<Tab>('walkthrough')
  const [ask, setAsk] = useState<{ docId: string; sectionId?: string; prompt: string; step?: { title: string; data: string }; n: number }>({ docId: 'overview.vision', prompt: '', n: 0 })
  const onAsk = (s: ComposedStep) => {
    const prompt = s.aiPrompt ? textOf(s.aiPrompt, i18n.language) : `${textOf(s.title, i18n.language)}: ${textOf(s.body, i18n.language)}`
    setAsk((a) => ({
      docId: s.target?.docId ?? 'overview.vision',
      sectionId: s.target?.section,
      prompt,
      step: { title: textOf(s.title, i18n.language), data: stepPromptData(view.walk, s, i18n.language) },
      n: a.n + 1,
    }))
    setTab('ai')
  }
  // The hint count lives in the top bar only, so the same number is not repeated here.
  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'walkthrough', label: t('workspace.tabs.walkthrough'), icon: 'compass' },
    { id: 'hints', label: t('workspace.tabs.hints'), icon: 'bulb' },
    { id: 'ai', label: t('workspace.tabs.ai'), icon: 'sparkle' },
  ]
  return (
    <div className="guide-center">
      <div className="center-tabs" role="tablist" aria-label={t('workspace.tabsLabel')} onKeyDown={(e) => {
        const i = tabs.findIndex((x) => x.id === tab)
        const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
        if (next < 0) return
        e.preventDefault()
        setTab(tabs[next].id)
        document.getElementById(`tab-${tabs[next].id}`)?.focus()
      }}>
        {tabs.map((x) => (
          <button key={x.id} role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} aria-controls={`panel-${x.id}`} tabIndex={tab === x.id ? 0 : -1} className={tab === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>
            <Icon name={x.icon} /> {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="center-panel">
        {tab === 'walkthrough' && (
          <>
            {setup}
            <CurrentStep view={view} onAsk={onAsk} />
            <WalkthroughList view={view} onAsk={onAsk} />
          </>
        )}
        {tab === 'hints' && <HintsTab focus={view.progress.next} />}
        {tab === 'ai' && <AiPanel key={ask.n} docId={ask.docId} sectionId={ask.sectionId} initialInstruction={ask.prompt} step={ask.step} />}
      </div>
    </div>
  )
}
