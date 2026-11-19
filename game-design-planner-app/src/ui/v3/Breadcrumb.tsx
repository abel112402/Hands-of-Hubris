import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { plannerPhase } from '../../core/compass'
import { entityRoute } from '../../core/palette'
import { getModule, getSections, MODULES } from '../../core/modules/registry'
import { useStore } from '../../core/store/store'
import { Menu } from '../Menu'
import { ModuleIcon } from '../ModuleIcon'
import { useWalkthrough } from '../workspace/useWalkthrough'
import { Icon } from '../Icon'

/**
 * Where you are, and a way sideways at every level (v3 "Navigation model"): Atlas › planner ▾ › section ▾ ›
 * entry. The planner menu lists the planners of the same phase, the section menu the planner's sections.
 */
export function Breadcrumb({ docId, sectionId, entityId }: { docId?: string; sectionId?: string; entityId?: string }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const loc = useLocation()
  const project = useStore((s) => s.project)
  const { walk } = useWalkthrough()
  const mod = docId ? getModule(docId) : undefined
  const sections = mod ? getSections(mod, project.registry) : []
  const sec = sections.find((s) => s.id === sectionId) ?? sections[0]
  const list = sec?.kind === 'collection' ? project.documents[mod!.id]?.data[sec.id] : undefined
  const entity = entityId && Array.isArray(list) ? list.find((e: { id: string }) => e.id === entityId) : undefined
  const page = loc.pathname.startsWith('/issues') ? t('nav.issues') : loc.pathname.startsWith('/settings') ? t('nav.settings') : undefined
  const phase = mod ? plannerPhase(walk, mod) : undefined
  const siblings = mod ? MODULES.filter((m) => plannerPhase(walk, m) === phase) : []

  return (
    <nav className="crumbs3" aria-label={t('v3.crumbs.label')}>
      <Link to="/" className="crumb3">{t('v3.rail.atlas')}</Link>
      {page && <><Sep /><span className="crumb3 here" aria-current="page">{page}</span></>}
      {mod && (
        <>
          <Sep />
          <Menu className="crumb3-menu" label={t('v3.crumbs.planners', { current: mod.title, phase: t(`walkthrough.phases.${phase}`) })} summary={<><ModuleIcon id={mod.id} /> <span className="crumb3-text">{mod.title}</span> <Icon name="chevronDown" /></>}>
            {siblings.map((m) => (
              <button key={m.id} aria-current={m.id === mod.id ? 'true' : undefined} onClick={() => nav(`/doc/${m.id}`)}>
                <ModuleIcon id={m.id} /> {m.title}
              </button>
            ))}
          </Menu>
        </>
      )}
      {mod && sec && (
        <>
          <Sep />
          <Menu className="crumb3-menu" label={t('v3.crumbs.sections', { current: sec.title, planner: mod.title })} summary={<><span className="crumb3-text">{sec.title}</span> <Icon name="chevronDown" /></>}>
            {sections.map((s) => (
              <button key={s.id} aria-current={s.id === sec.id ? 'true' : undefined} onClick={() => nav(entityRoute(mod.id, s.id))}>
                {s.title}
              </button>
            ))}
          </Menu>
        </>
      )}
      {entity && (
        <>
          <Sep />
          <span className="crumb3 here" aria-current="page">{String(entity.name ?? '').trim() || t('v3.record.unnamed')}</span>
        </>
      )}
    </nav>
  )
}

const Sep = () => <span className="crumb3-sep" aria-hidden="true">/</span>
