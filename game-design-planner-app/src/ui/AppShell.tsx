import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../core/store/store'
import { validateProject } from '../core/references/refs'
import { evaluateHints, makeContext } from '../core/hints/engine'
import { MODULES } from '../core/modules/registry'
import { setLanguage } from '../core/i18n'
import { writeAutosave } from '../core/persistence/autosave'
import { createSnapshot, downloadJson, exportMarkdownZip, newProject, openProject, saveProject } from './actions'

function Palette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const items = [
    ...MODULES.map((m) => ({ label: `${m.icon} ${m.title}`, to: `/doc/${m.id}` })),
    { label: 'Definitions', to: '/definitions' },
    { label: 'Issues', to: '/issues' },
    { label: 'Hints', to: '/hints' },
    { label: 'Menu', to: '/' },
  ].filter((i) => i.label.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Go to…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && items[0]) { nav(items[0].to); onClose() }
          }} />
        <ul>{items.slice(0, 12).map((i) => <li key={i.to}><button onClick={() => { nav(i.to); onClose() }}>{i.label}</button></li>)}</ul>
      </div>
    </div>
  )
}

export function AppShell() {
  const { t, i18n } = useTranslation()
  const project = useStore((s) => s.project)
  const dirty = useStore((s) => s.dirty)
  const fileName = useStore((s) => s.fileName)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const [palette, setPalette] = useState(false)
  const issues = validateProject(project).length
  const hintCount = useMemo(() => evaluateHints(makeContext(project)).total, [project])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const unsub = useStore.subscribe((s, prev) => {
      if (s.project === prev.project) return
      clearTimeout(timer)
      timer = setTimeout(() => void writeAutosave(s.project), 1500)
    })
    return () => { unsub(); clearTimeout(timer) }
  }, [])

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => { if (useStore.getState().dirty) e.preventDefault() }
    const keys = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const tag = (e.target as HTMLElement).tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); void saveProject(e.shiftKey) }
      else if (k === 'k') { e.preventDefault(); setPalette(true) }
      else if (!typing && k === 'z') { e.preventDefault(); if (e.shiftKey) useStore.getState().redo()
        else useStore.getState().undo() }
      else if (!typing && k === 'y') { e.preventDefault(); useStore.getState().redo() }
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('keydown', keys)
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('keydown', keys) }
  }, [])

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">{t('app.title')}</Link>
        <input className="title-input" value={project.meta.name}
          onChange={(e) => useStore.getState().mutate((p) => void (p.meta.name = e.target.value), 'name')} />
        <span className={'status' + (dirty ? ' dirty' : '')} title={fileName}>{dirty ? t('status.unsaved') : t('status.saved')}</span>
        <span className="spacer" />
        <button onClick={newProject}>{t('actions.new')}</button>
        <button onClick={() => void openProject()}>{t('actions.open')}</button>
        <button className="primary" onClick={() => void saveProject()}>{t('actions.save')}</button>
        <button onClick={() => void saveProject(true)}>{t('actions.saveAs')}</button>
        <button disabled={!canUndo} onClick={() => useStore.getState().undo()}>↶</button>
        <button disabled={!canRedo} onClick={() => useStore.getState().redo()}>↷</button>
        <details className="menu">
          <summary>⋯</summary>
          <div>
            <button onClick={() => void exportMarkdownZip()}>{t('actions.exportMd')}</button>
            <button onClick={downloadJson}>{t('actions.exportJson')}</button>
            <button onClick={() => void createSnapshot()}>{t('actions.snapshot')}</button>
            <button onClick={() => setLanguage(i18n.language === 'hu' ? 'en' : 'hu')}>Language: {i18n.language === 'hu' ? 'Magyar → English' : 'English → Magyar'}</button>
          </div>
        </details>
        <Link to="/definitions">{t('nav.definitions')}</Link>
        <Link to="/issues">{t('nav.issues')}{issues > 0 && <span className="badge">{issues}</span>}</Link>
        <Link to="/hints">{t('nav.hints')}{hintCount > 0 && <span className="badge">{hintCount}</span>}</Link>
        <button onClick={() => setPalette(true)} title={t('actions.search')}>🔍</button>
      </header>
      <div className="shell-body"><Outlet /></div>
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  )
}
