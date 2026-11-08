import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getModule, getSections } from '../../core/modules/registry'
import { exportAssets, exportPath, moduleToMarkdown } from '../../core/export/markdown'
import { useStore } from '../../core/store/store'
import { HintPanel } from '../hints/HintPanel'
import { HelpPopup } from '../HelpPopup'
import { SectionRenderer } from '../editors/SectionRenderer'
import { MarkdownPreview } from '../editors/simple'
import { exportDocumentJson, exportDocumentMarkdown, importDocument } from '../actions'
import { guideOf } from '../../modules/guides'
import type { ModuleGuide } from '../../core/guides/types'
import type { Project, SectionDef } from '../../core/model/types'
import { GuideMap } from '../guides/GuideMap'
import { ConceptCard } from '../guides/concepts'
import { Spotlight } from '../guides/Spotlight'
import { ExamplePicker } from '../guides/ExamplePicker'
import { useGuideUi } from '../guides/guideStore'
import { mapStates } from '../guides/GuideMap'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import { SideRail } from '../workspace/EditorRail'

const isEmptyCollection = (project: Project, docId: string, sec: SectionDef) => {
  if (sec.kind !== 'collection') return false
  const list = project.documents[docId]?.data[sec.id]
  return !Array.isArray(list) || list.length === 0
}

const MAP_KEY = 'hohplan:systemMapOpen'
const SEEN_KEY = (docId: string) => `hohplan:systemMapSeen:${docId}`

/**
 * Open on the first visit to a planner, so the map is discovered; after that it follows the
 * remembered choice and is closed by default, so the section starts near the top of the page.
 */
function initialMapOpen(docId: string): boolean {
  try {
    if (!localStorage.getItem(SEEN_KEY(docId))) {
      localStorage.setItem(SEEN_KEY(docId), '1')
      return true
    }
    return localStorage.getItem(MAP_KEY) === '1'
  } catch {
    return true
  }
}

/** Collapsible system map above the section; when closed, the summary line still shows progress. */
function SystemMapStrip({ docId, guide, current }: { docId: string; guide: ModuleGuide; current?: string }) {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const [open, setOpen] = useState(() => initialMapOpen(docId))
  const { empty, started } = useMemo(() => {
    const states = Object.values(mapStates(project, docId, guide.map))
    return { empty: states.filter((x) => x.state === 'empty').length, started: states.filter((x) => x.state === 'started').length }
  }, [project, docId, guide.map])
  return (
    <details
      className="system-map"
      open={open}
      onToggle={(e) => {
        const o = (e.target as HTMLDetailsElement).open
        setOpen(o)
        try {
          localStorage.setItem(MAP_KEY, o ? '1' : '0')
        } catch {
          /* not remembered */
        }
      }}
    >
      <summary>
        <Icon name="map" /> {t('map.title')}{' '}
        <span className="muted">{open ? t('map.hint') : t('map.summary', { empty, started })}</span>
      </summary>
      {open && <GuideMap docId={docId} map={guide.map} current={current} />}
    </details>
  )
}

export function EditorPage() {
  const { t } = useTranslation()
  const { docId = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const project = useStore((s) => s.project)
  const mod = getModule(docId)
  const [help, setHelp] = useState(false)
  useEffect(() => {
    if (mod) useStore.getState().ensureDoc(docId)
  }, [docId, mod])
  if (!mod) return <div className="page">Unknown planner. <Link to="/">Back</Link></div>
  const guide = guideOf(docId)
  const sections = getSections(mod, project.registry)
  const preview = sp.get('v') === 'md'
  const sec = sections.find((s) => s.id === sp.get('s')) ?? sections[0]
  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp)
    if (v) n.set(k, v); else n.delete(k)
    setSp(n, { replace: true })
  }

  return (
    <div className="editor-page">
      <SideRail />
      <nav className="sidebar">
        <Link to="/" className="muted">← {t('nav.home')}</Link>
        <h3>{mod.icon} {mod.title}</h3>
        {sections.map((s) => (
          <button key={s.id} className={s.id === sec?.id ? 'active' : ''} onClick={() => setParam('s', s.id)}>{s.title}</button>
        ))}
      </nav>
      <main className="content">
        <div className="toolbar">
          <button className={!preview ? 'active' : ''} onClick={() => setParam('v', null)}>{t('editor.visual')}</button>
          <button className={preview ? 'active' : ''} onClick={() => setParam('v', 'md')}>{t('editor.markdown')}</button>
          <span className="spacer" />
          <Menu className="doc-menu" label={t('editor.docMenu')} summary={<><Icon name="file" /> {t('editor.document')} <Icon name="chevronDown" /></>}>
            <button onClick={() => exportDocumentMarkdown(docId)}>{t('editor.downloadMd')}</button>
            <button onClick={() => exportDocumentJson(docId)}>{t('editor.exportDoc')}</button>
            <button onClick={() => void importDocument(docId)}>{t('editor.importDoc')}</button>
          </Menu>
          <button className="help-btn" onClick={() => setHelp(true)}><Icon name="help" /> {t('editor.help')}</button>
        </div>
        {guide && !preview && <SystemMapStrip key={docId} docId={docId} guide={guide} current={sec?.id} />}
        {preview ? (
          <MarkdownPreview text={moduleToMarkdown(project, mod)} assets={exportAssets(project, mod)} fromPath={exportPath(mod)} />
        ) : sec ? (
          <div key={`${docId}/${sec.id}`}>
            <div className="section-head">
              <h2>{sec.title}</h2>
              <span className="spacer" />
              {/* Empty collections offer examples in their empty state, so the header button would be a duplicate. */}
              {guide?.examples.some((e) => e.section === sec.id) && !isEmptyCollection(project, docId, sec) && (
                <button data-guide="examples" onClick={() => useGuideUi.getState().openPicker(sec.id)}><Icon name="sparkle" /> Insert example…</button>
              )}
            </div>
            {sec.description && <p className="muted">{sec.description}</p>}
            {guide?.concepts[sec.id] && <ConceptCard concept={guide.concepts[sec.id]} />}
            <SectionRenderer docId={docId} sec={sec} />
          </div>
        ) : null}
      </main>
      <HintPanel docId={docId} sectionId={sec?.id} />
      {guide && <Spotlight docId={docId} guide={guide} sectionId={sec?.id} />}
      {guide && <ExamplePicker guide={guide} />}
      {help && <HelpPopup docId={docId} title={sec ? `${mod.title} › ${sec.title}` : mod.title} sec={sec} onClose={() => setHelp(false)} />}
    </div>
  )
}
