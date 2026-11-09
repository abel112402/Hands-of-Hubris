import { useRef, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { editorGroups, readProfile } from '../../core/genre'
import { averageProgress, nextMilestone } from '../../core/progress'
import { validateProject } from '../../core/references/refs'
import { useStore } from '../../core/store/store'
import { PHASES, type PhaseId } from '../../core/walkthrough/types'
import type { WalkthroughProgress } from '../../core/walkthrough/evaluate'
import { Icon } from '../Icon'
import { useCountUp, useJustChanged, useStuck } from '../hooks'
import type { WalkthroughView } from './useWalkthrough'

const R = 34
const C = 2 * Math.PI * R

/** The arc and the number count up together; the label always carries the real value. */
function Ring({ percent: target, label, size = 88 }: { percent: number; label: string; size?: number }) {
  const percent = useCountUp(target)
  return (
    <svg className="progress-ring" viewBox="0 0 80 80" width={size} height={size} role="img" aria-label={label}>
      <circle cx="40" cy="40" r={R} className="ring-track" />
      <circle cx="40" cy="40" r={R} className="ring-value" strokeDasharray={`${(percent / 100) * C} ${C}`} transform="rotate(-90 40 40)" />
      <text x="40" y="46" textAnchor="middle" className="ring-text">{percent}%</text>
    </svg>
  )
}

const grew = (prev: number, next: number) => next > prev

/** One phase in the strip's track; a light sweeps across it when its share grows. */
function PhaseSegment({ phase, percent, className }: { phase: PhaseId; percent: number; className: string }) {
  const sweep = useJustChanged(percent, 900, grew)
  return <li data-phase={phase} className={className + (sweep ? ' sweep' : '')}><span style={{ width: `${percent}%` }} /></li>
}

function Bar({ percent }: { percent: number }) {
  return <span className="mini-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
}

type PhaseState = 'empty' | 'todo' | 'active' | 'done'

/** Per phase: share of finished (done or skipped) steps and a state that is never shown by colour alone. */
export function phaseSummary(progress: WalkthroughProgress, phase: PhaseId): { percent: number; state: PhaseState; finished: number; total: number } {
  const p = progress.phases.find((x) => x.phase === phase)
  if (!p?.total) return { percent: 0, state: 'empty', finished: 0, total: 0 }
  const finished = p.done + p.skipped
  const percent = Math.round((finished / p.total) * 100)
  return { percent, finished, total: p.total, state: percent === 100 ? 'done' : percent > 0 ? 'active' : 'todo' }
}

/** "5 of 33 steps done", plus the skipped count only when there is one. */
export function useProgressLine(progress: WalkthroughProgress) {
  const { t } = useTranslation()
  const line = t('workspace.progressDone', { done: progress.done, total: progress.total })
  return progress.skipped ? `${line} · ${t('workspace.progressSkipped', { count: progress.skipped })}` : line
}

/** Right pane: how far the plan is — walkthrough phases, planner fill, next milestone, open issues. */
export function ProgressPanel({ view, onClose }: { view: WalkthroughView; onClose?: () => void }) {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const { progress } = view
  const issues = validateProject(project).length
  const milestone = nextMilestone(project)
  const groups = editorGroups(readProfile(project))
  const line = useProgressLine(progress)

  return (
    <aside className="progress-panel" aria-label={t('workspace.progressTitle')}>
      <div className="progress-head">
        <h2>{t('workspace.progressTitle')}</h2>
        {onClose && (
          <button className="icon-btn drawer-close" aria-label={t('workspace.closeProgress')} title={t('workspace.closeProgress')} onClick={onClose}>
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="progress-overall">
        <Ring percent={progress.percent} label={t('workspace.overall', { percent: progress.percent })} />
        <div>
          <strong>{t('workspace.walkthroughLabel')}</strong>
          <p className="muted">{line}</p>
        </div>
      </div>

      <h3>{t('workspace.phases')}</h3>
      <ol className="walk-phases" aria-label={t('workspace.phases')}>
        {PHASES.map((phase) => {
          const s = phaseSummary(progress, phase)
          const current = progress.next?.phase === phase
          return (
            <li key={phase} className={`walk-phase-item ${s.state}${current ? ' current' : ''}`} data-phase={phase}>
              <span className="walk-phase-dot" aria-hidden="true" style={{ ['--p' as string]: s.percent }} />
              <span className="walk-phase-name">{t(`walkthrough.phases.${phase}`)}</span>
              <span className="sr-only">
                {t(`workspace.phaseState.${s.state}`)}
                {current && `, ${t('workspace.currentHere')}`}
              </span>
              <span className="walk-phase-value muted num" aria-hidden={!s.total}>{s.total ? `${s.finished}/${s.total}` : t('workspace.noSteps')}</span>
            </li>
          )
        })}
      </ol>

      <h3>{t('workspace.coverage')}</h3>
      <ul className="coverage">
        {groups.map((g) => {
          const pct = averageProgress(project, g.editors.map((e) => e.docId))
          return (
            <li key={g.group}>
              <span>{g.label}</span>
              <Bar percent={pct} />
              <span className="muted num">{pct}%</span>
            </li>
          )
        })}
      </ul>

      <h3>{t('workspace.milestone')}</h3>
      {milestone ? (
        <Link className="milestone-card" to="/doc/production.milestones">
          <strong>{milestone.name || t('workspace.unnamed')}</strong>
          <span className="muted">{[milestone.status, milestone.due].filter(Boolean).join(' · ')}</span>
        </Link>
      ) : (
        <p className="muted">
          {t('workspace.noMilestone')} <Link to="/doc/production.milestones">{t('workspace.planMilestones')}</Link>
        </p>
      )}

      {/* Hints already have their count in the top bar; issues are listed only when there are some. */}
      {issues > 0 && (
        <div className="progress-counts">
          <Link className="button small" to="/issues">{t('workspace.issues', { count: issues })}</Link>
        </div>
      )}
    </aside>
  )
}

/**
 * One-line progress for narrow screens (CSS shows it below 1200px, where the progress pane is a drawer):
 * the walkthrough share, a phase track and a button that opens the full pane.
 */
export function ProgressStrip({ view, open, onOpen, detailsRef }: { view: WalkthroughView; open: boolean; onOpen: () => void; detailsRef: RefObject<HTMLButtonElement | null> }) {
  const { t } = useTranslation()
  const { progress } = view
  const line = useProgressLine(progress)
  const phase = progress.next?.phase
  const strip = useRef<HTMLElement>(null)
  useStuck(strip)
  return (
    <section ref={strip} className="progress-strip" aria-label={t('workspace.stripLabel')}>
      <Ring percent={progress.percent} label={t('workspace.overall', { percent: progress.percent })} size={40} />
      <div className="progress-strip-text">
        <strong>{phase ? t(`walkthrough.phases.${phase}`) : t('workspace.allDone')}</strong>
        <span className="muted">{line}</span>
      </div>
      <ol className="phase-track" aria-hidden="true">
        {PHASES.map((p) => {
          const s = phaseSummary(progress, p)
          return <PhaseSegment key={p} phase={p} percent={s.percent} className={`${s.state}${p === phase ? ' current' : ''}`} />
        })}
      </ol>
      <button ref={detailsRef} className="small" aria-expanded={open} aria-controls="workspace-progress" onClick={onOpen}>{t('workspace.details')}</button>
    </section>
  )
}
