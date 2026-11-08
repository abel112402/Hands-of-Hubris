import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { composeProjectGuide, readProfile } from '../../core/genre'
import { getModule, getSections } from '../../core/modules/registry'
import { useStore } from '../../core/store/store'
import { genreNames } from './GenreProfilePanel'

const NEXT_STEPS = 3

/**
 * Project-level guide composed from the genre profile. It only links into the planners (and their own
 * module guides); completion comes from project data, so there is no separate state to save or share.
 */
export function ProjectGuide() {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const steps = useMemo(() => composeProjectGuide(project), [project])
  // Compact by default (next open steps only), so the planner grid stays near the top of the menu.
  const [all, setAll] = useState(false)
  if (!steps.length) return null
  const profile = readProfile(project)
  const done = steps.filter((s) => s.done).length
  const shown = all ? steps : steps.filter((s) => !s.done).slice(0, NEXT_STEPS)

  return (
    <details className="project-guide" open>
      <summary>
        <strong>{t('genres.guideTitle', { genres: genreNames(profile.genres) })}</strong>{' '}
        <span className="muted">{t('genres.guideProgress', { done, total: steps.length })}</span>
      </summary>
      <ol className="list guide-steps">
        {shown.map((s) => {
          const mod = getModule(s.docId)!
          const section = s.section ? getSections(mod, project.registry).find((x) => x.id === s.section) : undefined
          const to = `/doc/${s.docId}${section ? `?s=${encodeURIComponent(section.id)}` : ''}`
          return (
            <li key={s.id} className={s.done ? 'done' : ''}>
              <span className={`pill ${s.done ? 'ok' : ''}`}>{s.done ? `✓ ${t('genres.done')}` : t('genres.todo')}</span>
              <span className="guide-step-text">
                <strong>{s.title}</strong>
                <span className="muted">{s.body}</span>
                <span className="muted guide-step-source">
                  {s.sources.map((g) => (g === 'foundation' ? t('genres.whyFoundation') : genreNames([g]))).join(' · ')}
                </span>
              </span>
              <span className="spacer" />
              <Link to={to}>{t('genres.guideOpen', { doc: section ? `${mod.title} › ${section.title}` : mod.title })}</Link>
            </li>
          )
        })}
      </ol>
      {shown.length < steps.length || all ? (
        <button className="small" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? t('genres.guideLess') : t('genres.guideAll', { count: steps.length })}
        </button>
      ) : null}
    </details>
  )
}
