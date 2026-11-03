import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getModule, getSections } from '../../core/modules/registry'
import { moduleToMarkdown } from '../../core/export/markdown'
import { useStore } from '../../core/store/store'
import { HelpPopup } from '../HelpPopup'
import { SectionRenderer } from '../editors/SectionRenderer'
import { MarkdownPreview } from '../editors/simple'
import { exportDocumentJson, exportDocumentMarkdown, importDocument } from '../actions'

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
          <button className="help-btn" title="Help" onClick={() => setHelp(true)}>? Help</button>
          <button onClick={() => exportDocumentMarkdown(docId)}>.md</button>
          <button onClick={() => exportDocumentJson(docId)}>{t('editor.exportDoc')}</button>
          <button onClick={() => void importDocument(docId)}>{t('editor.importDoc')}</button>
        </div>
        {preview ? (
          <MarkdownPreview text={moduleToMarkdown(project, mod)} />
        ) : sec ? (
          <div key={`${docId}/${sec.id}`}>
            <h2>{sec.title}</h2>
            {sec.description && <p className="muted">{sec.description}</p>}
            <SectionRenderer docId={docId} sec={sec} />
          </div>
        ) : null}
      </main>
      {help && <HelpPopup docId={docId} title={sec ? `${mod.title} › ${sec.title}` : mod.title} sec={sec} onClose={() => setHelp(false)} />}
    </div>
  )
}
