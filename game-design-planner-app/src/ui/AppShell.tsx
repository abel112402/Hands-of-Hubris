import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../core/store/store'
import { validateProject } from '../core/references/refs'
import { useHints } from './hints/useHints'
import { MODULES } from '../core/modules/registry'
import { setLanguage } from '../core/i18n'
import { writeAutosave } from '../core/persistence/autosave'
import { createSnapshot, downloadJson, exportMarkdownZip, newProject, openProject, saveProject } from './actions'
import { Icon } from './Icon'
import { Menu } from './Menu'

function Palette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const items = [
    ...MODULES.map((m) => ({ label: `${m.icon} ${m.title}`, to: `/doc/${m.id}` })),
    { label: 'Definitions', to: '/definitions' },
    { label: 'Issues', to: '/issues' },
    { label: 'Hints', to: '/hints' },
    { label: 'AI settings', to: '/ai' },
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
  // Same hook as the panel and home page, so snoozing and the edit debounce apply everywhere.
  const hintCount = useHints().total
  const navLinks = (
    <>
      <NavLink to="/definitions" className="nav-link">{t('nav.definitions')}</NavLink>
      <NavLink to="/issues" className="nav-link">{t('nav.issues')}{issues > 0 && <span className="badge">{issues}</span>}</NavLink>
      <NavLink to="/hints" className="nav-link" title={t('hints.projectWide', { count: hintCount })} aria-label={`${t('nav.hints')}: ${t('hints.projectWide', { count: hintCount })}`}>
        {t('nav.hints')}{hintCount > 0 && <span className="badge" aria-hidden="true">{hintCount}</span>}
      </NavLink>
      <NavLink to="/ai" className="nav-link"><Icon name="sparkle" /> {t('nav.ai')}</NavLink>
    </>
  )

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
        <div className="topbar-left">
          <Link to="/" className="brand" title={t('nav.home')}>{t('app.title')}</Link>
          <input className="title-input" aria-label={t('app.projectName')} value={project.meta.name}
            onChange={(e) => useStore.getState().mutate((p) => void (p.meta.name = e.target.value), 'name')} />
          <span className={'status' + (dirty ? ' dirty' : '')} title={fileName}>{dirty ? t('status.unsaved') : t('status.saved')}</span>
        </div>
        <nav className="topnav" aria-label={t('nav.main')}>{navLinks}</nav>
        <div className="topbar-right">
          <button className="search-btn" onClick={() => setPalette(true)} title={t('actions.search')}>
            <Icon name="search" /> <span>{t('actions.searchBox')}</span> <kbd>Ctrl K</kbd>
          </button>
          <button className="icon-btn" disabled={!canUndo} aria-label={t('actions.undo')} title={`${t('actions.undo')} (Ctrl+Z)`} onClick={() => useStore.getState().undo()}><Icon name="undo" /></button>
          <button className="icon-btn" disabled={!canRedo} aria-label={t('actions.redo')} title={`${t('actions.redo')} (Ctrl+Y)`} onClick={() => useStore.getState().redo()}><Icon name="redo" /></button>
          {/* Save is the one filled action; everything else about files lives in its menu. */}
          <div className="split">
            <button className="primary" title={`${t('actions.save')} (Ctrl+S)`} onClick={() => void saveProject()}>{t('actions.save')}</button>
            <Menu className="split-menu" label={t('actions.more')} summary={<Icon name="chevronDown" />}>
              <button onClick={newProject}>{t('actions.new')}</button>
              <button onClick={() => void openProject()}>{t('actions.open')}</button>
              <button onClick={() => void saveProject(true)}>{t('actions.saveAs')}</button>
              <hr />
              <button onClick={() => void exportMarkdownZip()}>{t('actions.exportMd')}</button>
              <button onClick={downloadJson}>{t('actions.exportJson')}</button>
              <button onClick={() => void createSnapshot()}>{t('actions.snapshot')}</button>
              <button onClick={() => setLanguage(i18n.language === 'hu' ? 'en' : 'hu')}>Language: {i18n.language === 'hu' ? 'Magyar → English' : 'English → Magyar'}</button>
              {/* On narrow screens the nav row is hidden and its links appear here instead. */}
              <div className="menu-nav">
                <hr />
                {navLinks}
              </div>
            </Menu>
          </div>
        </div>
      </header>
      <div className="shell-body"><Outlet /></div>
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  )
}
