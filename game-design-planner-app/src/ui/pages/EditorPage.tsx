import { useEffect, useState } from 'react'
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
import { GuideMap } from '../guides/GuideMap'
import { ConceptCard } from '../guides/concepts'
import { Spotlight } from '../guides/Spotlight'
import { ExamplePicker } from '../guides/ExamplePicker'
import { useGuideUi } from '../guides/guideStore'

const MAP_KEY = 'hohplan:systemMapOpen'

/** Collapsible system map above the section; the open state is remembered per browser. */
function SystemMapStrip({ docId, guide, current }: { docId: string; guide: ModuleGuide; current?: string }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(MAP_KEY) !== '0'
    } catch {
      return true
    }
  })
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
      <summary>🗺️ System map <span className="muted">how the sections feed each other; click a box to open it</span></summary>
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
          <button className="help-btn" title="Help" aria-label="Help" onClick={() => setHelp(true)}>?</button>
          <button onClick={() => exportDocumentMarkdown(docId)}>.md</button>
          <button onClick={() => exportDocumentJson(docId)}>{t('editor.exportDoc')}</button>
          <button onClick={() => void importDocument(docId)}>{t('editor.importDoc')}</button>
        </div>
        {guide && !preview && <SystemMapStrip docId={docId} guide={guide} current={sec?.id} />}
        {preview ? (
          <MarkdownPreview text={moduleToMarkdown(project, mod)} assets={exportAssets(project, mod)} fromPath={exportPath(mod)} />
        ) : sec ? (
          <div key={`${docId}/${sec.id}`}>
            <div className="section-head">
              <h2>{sec.title}</h2>
              <span className="spacer" />
              {guide?.examples.some((e) => e.section === sec.id) && (
                <button data-guide="examples" onClick={() => useGuideUi.getState().openPicker(sec.id)}>✨ Insert example…</button>
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
