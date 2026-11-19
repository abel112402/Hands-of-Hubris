import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ATLAS_H, ATLAS_W, buildAtlas, type Atlas as AtlasModel } from '../../core/atlas'
import { emblemState } from '../../core/emblem'
import { readProfile } from '../../core/genre'
import { getModule, getSection } from '../../core/modules/registry'
import { readAutosave } from '../../core/persistence/autosave'
import { useCloud } from '../../core/cloud/session'
import { useStore } from '../../core/store/store'
import { textOf } from '../../core/walkthrough/compose'
import { setStepManual, setStepSkipped } from '../../core/walkthrough/evaluate'
import { stepLink } from '../../core/walkthrough/project'
import type { PhaseId } from '../../core/walkthrough/types'
import type { Project } from '../../core/model/types'
import { GUIDES } from '../../modules/guides'
import { restoreAutosave } from '../actions'
import { GenreSummary, useGenreNames } from '../genres/GenreProfilePanel'
import { Icon } from '../Icon'
import { ModuleIcon } from '../ModuleIcon'
import { Segmented } from '../motion'
import { GuideCenter } from '../workspace/GuideCenter'
import { useWalkthrough } from '../workspace/useWalkthrough'
import { Emblem } from './Emblem'
import { Ring } from './PhaseCompass'
import { dismissStudioOffer, setUiMode, STUDIO_OFFER_AT, useStudioOfferDismissed, useUiMode } from '../../core/uiMode'

const VIEW_KEY = 'hohplan:atlasView'
const PHASE_VAR: Record<PhaseId, string> = { concept: 'var(--phase-concept)', systems: 'var(--phase-systems)', content: 'var(--phase-content)', production: 'var(--phase-production)', ship: 'var(--phase-polish)' }
const pct = (v: number, of: number) => `${(v / of) * 100}%`

/** The first paragraph of a step's markdown body, as plain text. */
const firstParagraph = (md: string) => md.split(/\n\s*\n/)[0].replace(/[*_`#>]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()

/** The walkthrough's next step: where it is, what to do, and Open / Mark done / Skip. */
function StepCard() {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const { walk, progress } = useWalkthrough()
  const readOnly = useStore((s) => s.readOnly)
  const step = progress.next
  if (!step) return <section className="step3card done" aria-label={t('v3.atlas.stepCard')}><strong>{t('v3.atlas.allDone')}</strong></section>
  const link = stepLink(step.target)
  const mod = step.target ? getModule(step.target.docId) : undefined
  const sec = mod && step.target?.section ? getSection(mod, useStore.getState().project.registry, step.target.section) : undefined
  const where = [mod?.title, sec?.title].filter(Boolean).join(' › ')
  const n = walk.steps.findIndex((s) => s.id === step.id) + 1
  const mutate = (fn: (p: Project) => void) => useStore.getState().mutate(fn)
  return (
    <section className="step3card" aria-label={t('v3.atlas.stepCard')}>
      <span className="step3btn-dot" aria-hidden="true" />
      <div className="step3card-text">
        <div className="eyebrow">{t('v3.atlas.stepOf', { n, total: walk.steps.length })}{where && <> · {where}</>}</div>
        <h2 className="step3card-title">{textOf(step.title, i18n.language)}</h2>
        <p>{firstParagraph(textOf(step.body, i18n.language))}</p>
      </div>
      <div className="step3card-actions">
        {link && <button type="button" className="primary" onClick={() => nav(link)}>{t('v3.atlas.openStep')} <Icon name="chevronRight" /></button>}
        <button type="button" disabled={readOnly} onClick={() => mutate((p) => setStepManual(p, step.id, true))}>{t('v3.atlas.markDone')}</button>
        {step.optional && <button type="button" className="ghost" disabled={readOnly} onClick={() => mutate((p) => setStepSkipped(p, step.id, true))}>{t('v3.atlas.skip')}</button>}
      </div>
    </section>
  )
}

/** The map: phase regions (fogged until reached), links between planners, the walkthrough route, landmarks. */
function AtlasMap({ atlas }: { atlas: AtlasModel }) {
  const { t } = useTranslation()
  const at = Object.fromEntries(atlas.landmarks.map((l) => [l.id, l]))
  const fogged = new Set(atlas.regions.filter((r) => r.fog).map((r) => r.phase))
  return (
    <div className="atlas3-map bp-grid" style={{ aspectRatio: `${ATLAS_W} / ${ATLAS_H}` }}>
      <svg className="atlas3-svg" viewBox={`0 0 ${ATLAS_W} ${ATLAS_H}`} aria-hidden="true">
        {atlas.regions.map((r) => (
          <rect key={r.phase} x={r.x} y={r.y} width={r.w} height={r.h} rx={28} className={'atlas3-region' + (r.fog ? ' fog' : '')} style={{ stroke: PHASE_VAR[r.phase], fill: `color-mix(in srgb, ${PHASE_VAR[r.phase]} ${r.fog ? 3 : 7}%, transparent)` }} />
        ))}
        {atlas.links.map((l) => at[l.from] && at[l.to] && (
          <line key={`${l.from}>${l.to}`} className="atlas3-link" x1={at[l.from].x} y1={at[l.from].y} x2={at[l.to].x} y2={at[l.to].y} />
        ))}
        {atlas.route.map((s, i) => at[s.from] && at[s.to] && (
          <line key={i} className={'atlas3-route' + (s.walked ? ' walked' : '')} x1={at[s.from].x} y1={at[s.from].y} x2={at[s.to].x} y2={at[s.to].y} />
        ))}
      </svg>
      {atlas.regions.map((r) => (
        <div key={r.phase} className="atlas3-region-label" style={{ left: pct(r.x + 24, ATLAS_W), top: pct(r.y, ATLAS_H), color: PHASE_VAR[r.phase] }}>
          {t(`walkthrough.phases.${r.phase}`)}
          {r.fog && <span className="atlas3-uncharted">{t('v3.atlas.uncharted')}</span>}
        </div>
      ))}
      {atlas.landmarks.map((l) => (
        <Link
          key={l.id}
          to={`/doc/${l.id}`}
          viewTransition
          className={'atlas3-lm' + (fogged.has(l.phase) ? ' fogged' : '') + (l.id === atlas.here ? ' here' : '')}
          style={{ left: pct(l.x, ATLAS_W), top: pct(l.y, ATLAS_H), color: PHASE_VAR[l.phase] }}
          aria-label={`${getModule(l.id)?.title ?? l.title}, ${t('v3.compass.filled', { pct: l.progress })}${l.id === atlas.here ? `, ${t('v3.atlas.here')}` : ''}`}
        >
          <span className="atlas3-ring"><Ring value={l.progress} /><ModuleIcon id={l.id} /></span>
          <span className="atlas3-name">{l.title}</span>
          {l.id === atlas.here && <span className="atlas3-here">{t('v3.atlas.here')}</span>}
        </Link>
      ))}
      <div className="atlas3-legend" aria-hidden="true">
        <span><i className="walked" />{t('v3.atlas.legend.walked')}</span>
        <span><i className="ahead" />{t('v3.atlas.legend.ahead')}</span>
        <span><i className="link" />{t('v3.atlas.legend.links')}</span>
      </div>
    </div>
  )
}

/** The same planners as a list, grouped by phase: the accessible equal of the map (and quicker to scan). */
function AtlasList({ atlas }: { atlas: AtlasModel }) {
  const { t } = useTranslation()
  return (
    <div className="atlas3-list">
      {atlas.regions.map((r) => (
        <section key={r.phase} aria-labelledby={`atlas-${r.phase}`} className="atlas3-group">
          <h2 id={`atlas-${r.phase}`} style={{ color: PHASE_VAR[r.phase] }}>{t(`walkthrough.phases.${r.phase}`)} <span className="muted">{t('v3.compass.explored', { pct: r.progress })}</span></h2>
          <ul>
            {atlas.landmarks.filter((l) => l.phase === r.phase).map((l) => (
              <li key={l.id}>
                <Link to={`/doc/${l.id}`} className="flyout3-item">
                  <ModuleIcon id={l.id} />
                  <span className="flyout3-title">{l.title}{l.id === atlas.here && <span className="atlas3-here inline"> · {t('v3.atlas.here')}</span>}</span>
                  <span className="muted num">{l.progress}%</span>
                  <Ring value={l.progress} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * The v3 home (plans/UI_V3_PLAN.md, Screen 1): the project as a map of planners by phase, the next walkthrough
 * step as the one primary action, the design emblem, and the classic walkthrough (with hints and AI) below.
 */
export function Atlas() {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const cloudActive = useCloud((s) => !!s.active)
  const genresSet = !!useGenreNames()
  const view = useWalkthrough()
  const uiMode = useUiMode()
  const atlas = useMemo(() => buildAtlas(project, view.walk, GUIDES, view.progress.next, { fog: uiMode === 'guided' }), [project, view.walk, view.progress.next, uiMode])
  // Walkthrough steps the user finished (seed data in a sample project fills sections, but finishes few steps).
  const stepsDone = view.progress.done
  const offerDismissed = useStudioOfferDismissed()
  const emblem = useMemo(
    () => emblemState(readProfile(project).genres, Object.fromEntries(atlas.regions.map((r) => [r.phase, r.progress])), atlas.explored),
    [project, atlas],
  )
  const [mode, setMode] = useState<'map' | 'list'>(() => (localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'map'))
  const choose = (m: 'map' | 'list') => {
    setMode(m)
    try {
      localStorage.setItem(VIEW_KEY, m)
    } catch {
      /* not remembered */
    }
  }
  const [auto, setAuto] = useState<string | null>(null)
  useEffect(() => {
    void readAutosave().then((a) => setAuto(a ? new Date(a.savedAt).toLocaleString() : null))
  }, [])

  return (
    <div className="atlas3">
      <header className="atlas3-head">
        <div className="atlas3-titles">
          <p className="eyebrow">{t('v3.atlas.eyebrow')}</p>
          <h1>{project.meta.name || t('app.projectName')}</h1>
          <p className="muted atlas3-lede">{t('v3.atlas.lede')}</p>
          {!genresSet && <GenreSummary />}
        </div>
        <Emblem state={emblem} />
        <Segmented role="group" aria-label={t('v3.atlas.viewLabel')}>
          <button type="button" aria-pressed={mode === 'map'} onClick={() => choose('map')}>{t('v3.atlas.map')}</button>
          <button type="button" aria-pressed={mode === 'list'} onClick={() => choose('list')}>{t('v3.atlas.list')}</button>
        </Segmented>
      </header>
      {auto && !cloudActive && (
        <div className="banner" role="status">
          <span>{t('home.restoreBanner', { date: auto })}</span>
          <button onClick={() => void restoreAutosave()}>{t('actions.restore')}</button>
          <span className="spacer" />
          <button className="banner-close" aria-label={t('home.closeBanner')} title={t('home.closeBanner')} onClick={() => setAuto(null)}>×</button>
        </div>
      )}
      {uiMode === 'guided' && !offerDismissed && stepsDone >= STUDIO_OFFER_AT && (
        <div className="banner studio3-offer" role="status">
          <span>{t('v3.mode.offer', { count: stepsDone })}</span>
          <button className="primary" onClick={() => { setUiMode('studio'); dismissStudioOffer() }}>{t('v3.mode.tryStudio')}</button>
          <button className="ghost" onClick={dismissStudioOffer}>{t('v3.mode.noThanks')}</button>
        </div>
      )}
      <StepCard />
      {mode === 'map' ? <div className="atlas3-mapwrap"><AtlasMap atlas={atlas} /></div> : <AtlasList atlas={atlas} />}
      <details className="atlas3-walk">
        <summary>{t('v3.atlas.fullWalkthrough')}</summary>
        <GuideCenter view={view} />
      </details>
    </div>
  )
}
