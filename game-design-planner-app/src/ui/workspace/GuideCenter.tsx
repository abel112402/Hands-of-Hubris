import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../core/store/store'
import { genreLabel } from '../../core/genre'
import { groupWalkthrough, textOf } from '../../core/walkthrough/compose'
import { setStepManual, setStepSkipped, type WalkthroughProgress } from '../../core/walkthrough/evaluate'
import { stepLink } from '../../core/walkthrough/project'
import { focusHints, hintsForStep, stepPromptData } from '../../core/walkthrough/focus'
import type { WalkthroughView } from './useWalkthrough'
import type { ComposedStep, StepStatus } from '../../core/walkthrough/types'
import { HintCard } from '../hints/HintPanel'
import { useHints } from '../hints/useHints'
import { AiPanel } from '../ai/AiPanel'
import { Icon } from '../Icon'

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

const STATUS_ICON: Record<StepStatus, string> = { done: '✓', skipped: '–', open: '' }

function StepActions({ step, status, onAsk, primary }: { step: ComposedStep; status: StepStatus; onAsk: (s: ComposedStep) => void; primary?: boolean }) {
  const { t } = useTranslation()
  const readOnly = useStore((s) => s.readOnly)
  const link = stepLink(step.target)
  const mutate = useStore.getState().mutate
  return (
    <div className="step-actions">
      {link && <Link className={'button' + (primary ? ' primary' : '')} to={link}>{t('workspace.openPlanner')}</Link>}
      <button onClick={() => onAsk(step)}><Icon name="sparkle" /> {t('workspace.askAi')}</button>
      {status !== 'done' && <button disabled={readOnly} onClick={() => mutate((p) => setStepManual(p, step.id, true))}>{t('workspace.markDone')}</button>}
      {status === 'done' && <button disabled={readOnly} onClick={() => mutate((p) => setStepManual(p, step.id, false))}>{t('workspace.unmark')}</button>}
      {status === 'open' && <button disabled={readOnly} onClick={() => mutate((p) => setStepSkipped(p, step.id, true))}>{t('workspace.skip')}</button>}
      {status === 'skipped' && <button disabled={readOnly} onClick={() => mutate((p) => setStepSkipped(p, step.id, false))}>{t('workspace.unskip')}</button>}
    </div>
  )
}

const STEP_HINTS = 3

/** Hints that belong to this step (its quality gates and its target planner), so problems show where the work is. */
function StepHints({ step }: { step: ComposedStep }) {
  const { t } = useTranslation()
  const hints = hintsForStep(step, useHints().all)
  if (!hints.length) return null
  return (
    <section className="step-hints" aria-label={t('workspace.stepHints')}>
      <h3>{t('workspace.stepHints')} <span className="muted">({hints.length})</span></h3>
      <ul className="list">{hints.slice(0, STEP_HINTS).map((h) => <HintCard key={h.id} hint={h} />)}</ul>
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
  const { t, i18n } = useTranslation()
  const step = view.progress.next
  if (!step) {
    return (
      <section className="step-hero done" aria-label={t('workspace.currentStep')}>
        <h2>{t('workspace.allDone')}</h2>
        <p className="muted">{t('workspace.allDoneHint')}</p>
      </section>
    )
  }
  return (
    <section className="step-hero" aria-labelledby="current-step-title">
      <p className="step-crumb muted">{t('workspace.nextStep')} · {crumb(view.walk, step, t, i18n.language)} <GenreTags step={step} /></p>
      <h2 id="current-step-title">{textOf(step.title, i18n.language)}</h2>
      <p>{textOf(step.body, i18n.language)}</p>
      <Notes step={step} />
      <StepActions step={step} status="open" onAsk={onAsk} primary />
      <StepHints step={step} />
    </section>
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
  return (
    <div className="walk">
      <div className="walk-head">
        <span className="muted">{t('workspace.progressLine', { done: progress.done, skipped: progress.skipped, total: progress.total })}</span>
        <span className="spacer" />
        <div className="view-toggle" role="group" aria-label={t('workspace.viewLabel')}>
          <button className={mode === 'guided' ? 'active' : ''} aria-pressed={mode === 'guided'} onClick={() => setView('guided')}>{t('workspace.viewGuided')}</button>
          <button className={mode === 'checklist' ? 'active' : ''} aria-pressed={mode === 'checklist'} onClick={() => setView('checklist')}>{t('workspace.viewChecklist')}</button>
        </div>
      </div>
      {groupWalkthrough(view.walk).map((phase) => (
        <section key={phase.phase} className="walk-phase" aria-labelledby={`phase-${phase.phase}`}>
          <h3 id={`phase-${phase.phase}`}>{t(`walkthrough.phases.${phase.phase}`)}</h3>
          {phase.chapters.map((c) => (
            <div key={c.id} className="walk-chapter">
              <h4>{textOf(c.title, i18n.language)}</h4>
              <ol className="walk-steps">
                {c.steps.map((s) => (
                  <StepRow key={s.id} step={s} progress={progress} detailed={mode === 'guided'} onAsk={onAsk} />
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}
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
  const [open, setOpen] = useState(false)
  // The current step is already shown in full in the card above, so it starts collapsed here too.
  const expanded = detailed && open
  const link = stepLink(step.target)
  return (
    <li className={`walk-step ${status}${current ? ' current' : ''}`} data-testid={`walk-step-${step.id}`}>
      <div className="walk-step-head">
        <span className="walk-check" aria-label={t(`workspace.status.${status}`)}>{STATUS_ICON[status]}</span>
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
  if (!visible.length) return <p className="muted">{t('hints.none')}</p>
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

/** Center pane: the step to do now, then the walkthrough, project hints and AI as tabs. */
export function GuideCenter({ view }: { view: WalkthroughView }) {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<Tab>('walkthrough')
  const [ask, setAsk] = useState<{ docId: string; sectionId?: string; prompt: string; step?: { title: string; data: string }; n: number }>({ docId: 'overview.vision', prompt: '', n: 0 })
  const hintCount = useHints().total
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
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'walkthrough', label: t('workspace.tabs.walkthrough') },
    { id: 'hints', label: t('workspace.tabs.hints'), badge: hintCount },
    { id: 'ai', label: t('workspace.tabs.ai') },
  ]
  return (
    <div className="guide-center">
      <CurrentStep view={view} onAsk={onAsk} />
      <div className="center-tabs" role="tablist" aria-label={t('workspace.tabsLabel')}>
        {tabs.map((x) => (
          <button key={x.id} role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} aria-controls={`panel-${x.id}`} className={tab === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>
            {x.label}{!!x.badge && <span className="badge" aria-hidden="true">{x.badge}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="center-panel">
        {tab === 'walkthrough' && <WalkthroughList view={view} onAsk={onAsk} />}
        {tab === 'hints' && <HintsTab focus={view.progress.next} />}
        {tab === 'ai' && <AiPanel key={ask.n} docId={ask.docId} sectionId={ask.sectionId} initialInstruction={ask.prompt} step={ask.step} />}
      </div>
    </div>
  )
}
