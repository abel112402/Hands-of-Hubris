import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { genreLabel } from '../../core/genre'
import { useStore } from '../../core/store/store'
import { evaluateWalkthrough, readGuideState, resetGuideState } from '../../core/walkthrough/evaluate'
import { projectWalkthrough } from '../../core/walkthrough/project'

/** Settings › Walkthrough: which packs make up the walkthrough, progress per phase, and resets. */
export function WalkthroughSettings() {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const readOnly = useStore((s) => s.readOnly)
  const walk = projectWalkthrough(project)
  const progress = useMemo(() => evaluateWalkthrough(walk, project), [walk, project])
  const state = readGuideState(project)
  const moduleTicks = Object.values(state.modules ?? {}).reduce((n, l) => n + l.length, 0)
  const mutate = useStore.getState().mutate

  return (
    <div className="settings-form">
      <h2>{t('settingsPage.tabs.walkthrough')}</h2>
      <p className="muted">{t('walkthrough.settings.intro')}</p>
      <h3>{t('walkthrough.settings.packs')}</h3>
      <ul className="list">
        {Object.entries(walk.packs).map(([id, version]) => (
          <li key={id}>
            {id === 'base' ? t('walkthrough.settings.base') : genreLabel(id)} <span className="muted">v{version}</span>
          </li>
        ))}
      </ul>
      <h3>{t('walkthrough.settings.progress', { done: progress.done, skipped: progress.skipped, total: progress.total })}</h3>
      <dl className="settings-meta">
        {progress.phases.map((p) => (
          <div key={p.phase} style={{ display: 'contents' }}>
            <dt>{t(`walkthrough.phases.${p.phase}`)}</dt>
            <dd>{t('walkthrough.settings.phaseLine', { done: p.done, skipped: p.skipped, total: p.total })}</dd>
          </div>
        ))}
      </dl>
      <h3>{t('walkthrough.settings.reset')}</h3>
      <p className="muted">{t('walkthrough.settings.resetHint')}</p>
      <div className="row">
        <button disabled={readOnly || (!state.manual.length && !state.skipped.length)} onClick={() => mutate((p) => resetGuideState(p))}>
          {t('walkthrough.settings.resetSteps', { count: state.manual.length + state.skipped.length })}
        </button>
        <button disabled={readOnly || !moduleTicks} onClick={() => mutate((p) => resetGuideState(p, { modules: true }))}>
          {t('walkthrough.settings.resetAll', { count: state.manual.length + state.skipped.length + moduleTicks })}
        </button>
      </div>
    </div>
  )
}
