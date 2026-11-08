import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { editorGroups, readProfile, type EditorEntry } from '../../core/genre'
import { MODULES, getModule } from '../../core/modules/registry'
import { docProgress } from '../../core/progress'
import { useStore } from '../../core/store/store'
import type { Project } from '../../core/model/types'
import { genreNames, reasonText } from '../genres/GenreProfilePanel'
import { Icon } from '../Icon'

const COLLAPSED_KEY = 'hohplan:railCollapsed'
const OPEN_KEY = 'hohplan:railOpen'

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* not remembered */
  }
}

function RailItem({ entry, project, star }: { entry: EditorEntry; project: Project; star: boolean }) {
  const { t } = useTranslation()
  const m = getModule(entry.docId)!
  const p = docProgress(project, m.id)
  const why = entry.reasons ? reasonText(t, entry.reasons) : m.summary
  return (
    <NavLink to={`/doc/${m.id}`} className="rail-item" title={why}>
      <span className="rail-icon" aria-hidden="true">{m.icon}</span>
      <span className="rail-title">{m.title}</span>
      {star && <span className="rail-star" title={t('genres.recommendedBadge')}>★<span className="sr-only"> {t('genres.recommendedBadge')}</span></span>}
      <span className="rail-meter" role="img" aria-label={t('workspace.filled', { percent: p })}>
        <span style={{ width: `${p}%` }} />
      </span>
    </NavLink>
  )
}

/**
 * Planner navigation: every group, with Game Design narrowed to the genre's recommendations
 * (expandable). Same data as Settings › Genre & editors, via editorGroups().
 */
export function EditorRail({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const profile = readProfile(project)
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<string[]>(() => readJson(COLLAPSED_KEY, []))
  const [expanded, setExpanded] = useState(false)
  const match = (docId: string) => {
    const m = getModule(docId)
    const s = q.trim().toLowerCase()
    return !!m && (!s || m.title.toLowerCase().includes(s) || m.summary.toLowerCase().includes(s))
  }
  const toggle = (g: string) => {
    const next = collapsed.includes(g) ? collapsed.filter((x) => x !== g) : [...collapsed, g]
    setCollapsed(next)
    writeJson(COLLAPSED_KEY, next)
  }

  return (
    <nav className="rail" aria-label={t('workspace.planners')} onClick={(e) => (e.target as HTMLElement).closest('a') && onNavigate?.()}>
      <input className="rail-filter search" type="search" aria-label={t('home.filter')} placeholder={t('home.filter')} value={q} onChange={(e) => setQ(e.target.value)} />
      {editorGroups(profile).map((g) => {
        const showAll = g.filtered && expanded
        const entries: EditorEntry[] = showAll
          ? MODULES.filter((m) => m.group === g.group).map((m) => g.editors.find((e) => e.docId === m.id) ?? { docId: m.id, recommended: false })
          : g.editors
        const shown = entries.filter((e) => match(e.docId))
        // Filtering opens every group, so matches are never hidden in a collapsed one.
        const isCollapsed = !q && collapsed.includes(g.group)
        if (q && !shown.length) return null
        const id = `rail-${g.group}`
        return (
          <section key={g.group} className="rail-group" aria-labelledby={id}>
            <h2 id={id} className="rail-head">
              <button className="rail-toggle" aria-expanded={!isCollapsed} onClick={() => toggle(g.group)}>
                <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} /> {g.label}
              </button>
            </h2>
            {!isCollapsed && (
              <>
                {g.filtered && <p className="rail-note muted">{t('genres.recommendedFor', { genres: genreNames(profile.genres) })}</p>}
                <div className="rail-list">
                  {shown.map((e) => (
                    // In a narrowed group every planner is recommended, so the star only marks them in mixed lists.
                    <RailItem key={e.docId} entry={e} project={project} star={e.recommended && (showAll || !g.filtered)} />
                  ))}
                </div>
                {g.filtered && g.hidden > 0 && (
                  <button className="rail-more small" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                    {expanded ? t('workspace.showRecommended') : t('genres.showAll', { count: g.hidden })}
                  </button>
                )}
              </>
            )}
          </section>
        )
      })}
    </nav>
  )
}

/**
 * Collapsible rail for planner pages: a thin strip with a toggle; open, it shows the full rail.
 * The choice is remembered per browser.
 */
export function SideRail() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => readJson(OPEN_KEY, false))
  const set = (o: boolean) => {
    setOpen(o)
    writeJson(OPEN_KEY, o)
  }
  return (
    <div className={'side-rail' + (open ? ' open' : '')}>
      <button className="icon-btn side-rail-toggle" aria-expanded={open} aria-label={open ? t('workspace.hidePlanners') : t('workspace.showPlanners')} title={open ? t('workspace.hidePlanners') : t('workspace.showPlanners')} onClick={() => set(!open)}>
        <Icon name={open ? 'chevronLeft' : 'chevronRight'} />
      </button>
      {open && <EditorRail />}
    </div>
  )
}
