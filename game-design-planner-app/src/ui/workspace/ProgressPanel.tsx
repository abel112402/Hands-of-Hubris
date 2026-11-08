import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { editorGroups, readProfile } from '../../core/genre'
import { averageProgress, nextMilestone } from '../../core/progress'
import { validateProject } from '../../core/references/refs'
import { useStore } from '../../core/store/store'
import { PHASES } from '../../core/walkthrough/types'
import { useHints } from '../hints/useHints'
import type { WalkthroughView } from './useWalkthrough'

const R = 34
const C = 2 * Math.PI * R

function Ring({ percent, label }: { percent: number; label: string }) {
  return (
    <svg className="progress-ring" viewBox="0 0 80 80" width="88" height="88" role="img" aria-label={label}>
      <circle cx="40" cy="40" r={R} className="ring-track" />
      <circle cx="40" cy="40" r={R} className="ring-value" strokeDasharray={`${(percent / 100) * C} ${C}`} transform="rotate(-90 40 40)" />
      <text x="40" y="45" textAnchor="middle" className="ring-text">{percent}%</text>
    </svg>
  )
}

function Bar({ percent }: { percent: number }) {
  return <span className="mini-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
}

/** Right pane: how far the plan is — walkthrough phases, planner coverage, next milestone, open issues. */
export function ProgressPanel({ view }: { view: WalkthroughView }) {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const { progress } = view
  const issues = validateProject(project).length
  const hints = useHints().total
  const milestone = nextMilestone(project)
  const groups = editorGroups(readProfile(project))

  return (
    <aside className="progress-panel" aria-label={t('workspace.progressTitle')}>
      <h2>{t('workspace.progressTitle')}</h2>
      <div className="progress-overall">
        <Ring percent={progress.percent} label={t('workspace.overall', { percent: progress.percent })} />
        <div>
          <strong>{t('workspace.walkthroughLabel')}</strong>
          <p className="muted">{t('workspace.progressLine', { done: progress.done, skipped: progress.skipped, total: progress.total })}</p>
        </div>
      </div>

      <h3>{t('workspace.phases')}</h3>
      <ol className="walk-phases" aria-label={t('workspace.phases')}>
        {PHASES.map((phase) => {
          const p = progress.phases.find((x) => x.phase === phase)
          const pct = p?.total ? Math.round(((p.done + p.skipped) / p.total) * 100) : 0
          const state = !p ? 'empty' : pct === 100 ? 'done' : pct > 0 || progress.next?.phase === phase ? 'active' : 'todo'
          return (
            <li key={phase} className={`walk-phase-item ${state}`}>
              <span className="walk-phase-dot" aria-hidden="true" />
              <span className="walk-phase-name">{t(`walkthrough.phases.${phase}`)}</span>
              <span className="walk-phase-value muted">{p ? `${pct}%` : t('workspace.noSteps')}</span>
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
              <span className="muted">{pct}%</span>
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

      <div className="progress-counts">
        <Link to="/issues">{t('workspace.issues', { count: issues })}</Link>
        <Link to="/settings/hints">{t('workspace.hints', { count: hints })}</Link>
      </div>
    </aside>
  )
}
