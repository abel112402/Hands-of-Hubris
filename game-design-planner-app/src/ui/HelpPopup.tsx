import { useEffect } from 'react'
import type { SectionDef } from '../core/model/types'
import { getHelp } from './help'

export function HelpPopup({ docId, title, sec, onClose }: { docId: string; title: string; sec?: SectionDef; onClose: () => void }) {
  const { module, kind } = getHelp(docId, sec)
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onClick={onClose}>
      <div className="help-popup" role="dialog" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <div className="inspector-head"><h2>{title}</h2><span className="spacer" /><button onClick={onClose}>✕</button></div>
        <h3>Why this plan matters</h3>
        <p>{module.purpose}</p>
        {kind && (<><h3>How to use this editor ({kind.title})</h3><ul>{kind.steps.map((s) => <li key={s}>{s}</li>)}</ul></>)}
        <h3>Tips</h3>
        <ul>{module.tips.map((s) => <li key={s}>{s}</li>)}</ul>
        {module.links && (<><h3>Useful links</h3><ul>{module.links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer noopener">{l.label}</a></li>)}</ul></>)}
        <p className="muted">Shortcuts: Ctrl+S save · Ctrl+Z / Ctrl+Y undo/redo · Ctrl+K go to…</p>
      </div>
    </div>
  )
}
