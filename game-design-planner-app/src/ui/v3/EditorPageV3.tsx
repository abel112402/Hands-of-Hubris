import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getModule, getSections } from '../../core/modules/registry'
import { exportAssets, exportPath, moduleToMarkdown } from '../../core/export/markdown'
import { sectionStates, type SectionState } from '../../core/progress'
import { useStore } from '../../core/store/store'
import type { Project, SectionDef } from '../../core/model/types'
import { guideOf } from '../../modules/guides'
import { HelpPopup } from '../HelpPopup'
import { SectionRenderer } from '../editors/SectionRenderer'
import { MarkdownPreview } from '../editors/simple'
import { exportDocumentJson, exportDocumentMarkdown, importDocument } from '../actions'
import { GuideMap } from '../guides/GuideMap'
import { ConceptCard } from '../guides/concepts'
import { Spotlight } from '../guides/Spotlight'
import { ExamplePicker } from '../guides/ExamplePicker'
import { useGuideUi } from '../guides/guideStore'
import { WalkthroughChip } from '../workspace/WalkthroughChip'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import { ModuleIcon } from '../ModuleIcon'
import { Sheet } from './Sheet'

const isEmptyCollection = (project: Project, docId: string, sec: SectionDef) => {
  if (sec.kind !== 'collection') return false
  const list = project.documents[docId]?.data[sec.id]
  return !Array.isArray(list) || list.length === 0
}

/** ○ empty · ◐ started · ● done: a shape, not only a colour (coding conventions). */
export function StateGlyph({ state }: { state: SectionState }) {
  return <span className={'glyph3 ' + state} aria-hidden="true" />
}

/**
 * A planner in the v3 frame (plans/UI_V3_PLAN.md, Phase 1): one compact section header (planner, title, state,
 * about, actions), the walkthrough step when this section is one, a strip of the planner's sections, then the
 * section with the full width. The system map opens in a sheet; hints live in the shell's companion tray.
 */
export function EditorPageV3() {
  const { t } = useTranslation()
  const { docId = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const project = useStore((s) => s.project)
  const mod = getModule(docId)
  const [help, setHelp] = useState(false)
  const [about, setAbout] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  useEffect(() => {
    if (mod) useStore.getState().ensureDoc(docId)
  }, [docId, mod])
  const states = useMemo(() => (mod ? sectionStates(project, docId) : {}), [project, docId, mod])
  const sections = mod ? getSections(mod, project.registry) : []
  const sec = sections.find((s) => s.id === sp.get('s')) ?? sections[0]
  // Opening another section (from the strip or the map) closes the map and the about panel.
  const [shownFor, setShownFor] = useState(sec?.id)
  if (sec?.id !== shownFor) {
    setShownFor(sec?.id)
    setMapOpen(false)
    setAbout(false)
  }

  if (!mod) return <div className="page">{t('v3.section.unknown')} <Link to="/">{t('nav.home')}</Link></div>
  const guide = guideOf(docId)
  const preview = sp.get('v') === 'md'
  const togglePreview = () => {
    const n = new URLSearchParams(sp)
    if (preview) n.delete('v')
    else n.set('v', 'md')
    setSp(n, { replace: true })
  }
  const goSection = (id: string) => {
    const n = new URLSearchParams()
    n.set('s', id)
    if (preview) n.set('v', 'md')
    setSp(n)
  }
  const state = sec ? states[sec.id] : undefined
  const filled = sections.filter((s) => states[s.id] && states[s.id].state !== 'empty').length
  const concept = sec ? guide?.concepts[sec.id] : undefined
  const hasExamples = !!sec && !!guide?.examples.some((e) => e.section === sec.id) && !isEmptyCollection(project, docId, sec)

  return (
    <div className="editor3">
      <header className="sec3-head">
        <div className="sec3-top">
          <div className="sec3-titles">
            <div className="eyebrow sec3-planner"><ModuleIcon id={mod.id} /> {mod.title} <span className="sec3-count">· {t('v3.section.filled', { filled, total: sections.length })}</span></div>
            <h1 className="sec3-title">{sec?.title ?? mod.title}</h1>
          </div>
          {state && (
            <span className={'sec3-state ' + state.state}>
              <StateGlyph state={state.state} />
              {t(`v3.section.state.${state.state}`)}
              {state.hints > 0 && <span className="sec3-hints">{t('v3.section.hints', { count: state.hints })}</span>}
            </span>
          )}
          {(sec?.description || concept) && (
            <button type="button" className="icon-btn" aria-expanded={about} aria-label={t('v3.section.about')} title={t('v3.section.about')} onClick={() => setAbout(!about)}>
              <Icon name="help" />
            </button>
          )}
          <span className="spacer" />
          {hasExamples && (
            <button type="button" className="ghost" data-guide="examples" onClick={() => useGuideUi.getState().openPicker(sec!.id)}>
              <Icon name="sparkle" /> {t('guide.insertExample')}
            </button>
          )}
          <Menu className="doc-menu" label={t('v3.section.more')} summary={<Icon name="more" />}>
            <button onClick={togglePreview}>{preview ? t('editor.visual') : t('editor.markdown')}</button>
            <hr />
            <button onClick={() => exportDocumentMarkdown(docId)}>{t('editor.downloadMd')}</button>
            <button onClick={() => exportDocumentJson(docId)}>{t('editor.exportDoc')}</button>
            <button onClick={() => void importDocument(docId)}>{t('editor.importDoc')}</button>
            <hr />
            <button onClick={() => setHelp(true)}>{t('editor.help')}</button>
          </Menu>
        </div>
        {about && sec && (
          <div className="sec3-about">
            {sec.description && <p>{sec.description}</p>}
            {concept && <ConceptCard concept={concept} />}
          </div>
        )}
        {sec && <WalkthroughChip docId={docId} sectionId={sec.id} />}
        <nav className="sec3-strip" aria-label={t('editor.sections')}>
          {sections.map((s) => {
            const st = states[s.id]
            const on = s.id === sec?.id
            return (
              <button key={s.id} type="button" className={'step3' + (on ? ' on' : '')} aria-current={on ? 'step' : undefined} onClick={() => goSection(s.id)}>
                <StateGlyph state={st?.state ?? 'empty'} />
                <span className="step3-name">{s.title}</span>
                <span className="sr-only">, {t(`v3.section.state.${st?.state ?? 'empty'}`)}</span>
                {!!st?.hints && <span className="step3-hints" aria-label={t('v3.section.hints', { count: st.hints })}>{st.hints}</span>}
              </button>
            )
          })}
          {guide && (
            <button type="button" className="ghost step3-map" onClick={() => setMapOpen(true)}>
              <Icon name="map" /> {t('v3.section.map')}
            </button>
          )}
        </nav>
      </header>
      <div className="sec3-body">
        {preview ? (
          <MarkdownPreview text={moduleToMarkdown(project, mod)} assets={exportAssets(project, mod)} fromPath={exportPath(mod)} />
        ) : sec ? (
          <div key={`${docId}/${sec.id}`} className="section-swap">
            <SectionRenderer docId={docId} sec={sec} />
          </div>
        ) : null}
      </div>
      {mapOpen && guide && (
        <Sheet label={t('map.title')} eyebrow={t('map.title')} title={mod.title} width={760} onClose={() => setMapOpen(false)}>
          <p className="muted">{t('map.hint')}</p>
          <GuideMap docId={docId} map={guide.map} current={sec?.id} />
        </Sheet>
      )}
      {guide && <Spotlight docId={docId} guide={guide} sectionId={sec?.id} />}
      {guide && <ExamplePicker guide={guide} />}
      {help && <HelpPopup docId={docId} title={sec ? `${mod.title} › ${sec.title}` : mod.title} sec={sec} onClose={() => setHelp(false)} />}
    </div>
  )
}
