import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { GROUPS, MODULES, getModule, getSections } from '../../core/modules/registry'
import { useStore } from '../../core/store/store'
import { deleteSnapshot, listSnapshots, readAutosave, type Snapshot } from '../../core/persistence/autosave'
import { deserializeProject } from '../../core/persistence/serialize'
import { restoreAutosave } from '../actions'
import { HintCard } from '../hints/HintPanel'
import { useHints } from '../hints/useHints'
import { hasGenreProfile, readProfile, recommendEditors, type RecommendationReason } from '../../core/genre'
import type { PlannerModule, Project } from '../../core/model/types'
import { GenreProfilePanel, genreNames, reasonText } from '../genres/GenreProfilePanel'
import { ProjectGuide } from '../genres/ProjectGuide'
import { useCloud } from '../../core/cloud/session'

function ModuleCard({ m, project, reasons, recommended }: { m: PlannerModule; project: Project; reasons?: RecommendationReason[]; recommended?: boolean }) {
  const { t } = useTranslation()
  const p = progress(project.documents[m.id], getSections(m, project.registry).length)
  return (
    <Link className="card module-card" to={`/doc/${m.id}`}>
      <div className="icon">{m.icon}</div>
      <strong>
        {m.title}
        {recommended && <span className="pill recommended-badge" title={t('genres.recommendedBadge')}>★ <span className="sr-only">{t('genres.recommendedBadge')}</span></span>}
      </strong>
      <span className="muted">{m.summary}</span>
      {reasons && <span className="muted module-why">{reasonText(t, reasons)}</span>}
      <div className="bar"><div style={{ width: `${p}%` }} /></div>
    </Link>
  )
}

function progress(doc: { data: Record<string, any> } | undefined, total: number) {
  if (!doc) return 0
  const filled = Object.values(doc.data).filter((v) =>
    Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.values(v).some((x) => (Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : x !== '' && x != null)) : !!v,
  ).length
  return total ? Math.round((filled / total) * 100) : 0
}

export function Home() {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  // The local autosave banner belongs to local mode; cloud projects recover from their own drafts.
  const cloudActive = useCloud((s) => !!s.active)
  const [q, setQ] = useState('')
  const [auto, setAuto] = useState<string | null>(null)
  const [snaps, setSnaps] = useState<Snapshot[]>([])
  const refresh = () => void listSnapshots().then(setSnaps)
  useEffect(() => {
    void readAutosave().then((a) => setAuto(a ? new Date(a.savedAt).toLocaleString() : null))
    refresh()
  }, [])
  const { visible: nextSteps } = useHints()
  // One next step by default, so the planner grid stays above the fold; the rest on request.
  const [allSteps, setAllSteps] = useState(false)
  const shownSteps = allSteps ? nextSteps : nextSteps.slice(0, 1)
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase())
  const profile = readProfile(project)
  const tailored = hasGenreProfile(profile)
  const [view, setView] = useState<'recommended' | 'all'>('recommended')
  const showRecommended = tailored && view === 'recommended'
  const recs = recommendEditors(profile)
  const recSet = new Set(recs.map((r) => r.docId))

  return (
    <div className="page home">
      <h1>{t('home.title')}</h1>
      <p className="muted">{t('home.subtitle')}</p>
      {auto && !cloudActive && (
        <div className="banner" role="status">
          <span>{t('home.restoreBanner', { date: auto })}</span>
          <button onClick={() => void restoreAutosave()}>{t('actions.restore')}</button>
          <span className="spacer" />
          <button className="banner-close" aria-label={t('home.closeBanner')} title={t('home.closeBanner')} onClick={() => setAuto(null)}>×</button>
        </div>
      )}
      <GenreProfilePanel />
      <ProjectGuide />
      <div className="home-tools">
        <input className="search" aria-label={t('home.filter')} placeholder={t('home.filter')} value={q} onChange={(e) => setQ(e.target.value)} />
        {tailored && (
          <div className="view-toggle" role="group" aria-label={t('genres.viewLabel')}>
            <button className={view === 'recommended' ? 'active' : ''} aria-pressed={view === 'recommended'} onClick={() => setView('recommended')}>
              {t('genres.viewRecommended')}
            </button>
            <button className={view === 'all' ? 'active' : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>
              {t('genres.viewAll')}
            </button>
          </div>
        )}
      </div>
      {nextSteps.length > 0 && (
        <section className="next-steps">
          <h2>💡 {t('hints.nextSteps')}</h2>
          <ul className="list">{shownSteps.map((h) => <HintCard key={h.id} hint={h} />)}</ul>
          {nextSteps.length > 1 && (
            <button className="small" aria-expanded={allSteps} onClick={() => setAllSteps(!allSteps)}>
              {allSteps ? t('hints.showLess') : t('hints.showMore', { count: nextSteps.length - 1 })}
            </button>
          )}
        </section>
      )}
      {showRecommended && (() => {
        const shown = recs.filter((r) => { const m = getModule(r.docId); return m && (match(m.title) || match(m.summary)) })
        return (
          <section>
            <h2>{t('genres.recommendedFor', { genres: genreNames(profile.genres) })}</h2>
            {shown.length ? (
              <div className="cards">
                {shown.map((r) => <ModuleCard key={r.docId} m={getModule(r.docId)!} project={project} reasons={r.reasons} />)}
              </div>
            ) : (
              <p className="muted">{t('genres.noMatch')}</p>
            )}
            <button className="small" onClick={() => setView('all')}>{t('genres.showAll', { count: MODULES.length - recs.length })}</button>
          </section>
        )
      })()}
      {!showRecommended && GROUPS.map((g) => {
        const mods = MODULES.filter((m) => m.group === g.id && (match(m.title) || match(m.summary)))
        if (!mods.length) return null
        return (
          <section key={g.id}>
            <h2>{g.label}</h2>
            <div className="cards">
              {mods.map((m) => <ModuleCard key={m.id} m={m} project={project} recommended={tailored && recSet.has(m.id)} />)}
            </div>
          </section>
        )
      })}
      {snaps.length > 0 && (
        <section>
          <h2>Snapshots</h2>
          <ul className="list">
            {snaps.map((s) => (
              <li key={s.savedAt}>
                <span>{s.name} <span className="muted">{new Date(s.savedAt).toLocaleString()}</span></span>
                <span className="spacer" />
                <button onClick={() => { if (confirm('Load this snapshot?')) useStore.getState().loadProject(deserializeProject(s.json).project) }}>Load</button>
                <button className="danger" onClick={() => void deleteSnapshot(s.savedAt).then(refresh)}>Delete</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
