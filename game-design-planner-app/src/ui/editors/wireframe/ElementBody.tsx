import type { Project } from '../../../core/model/types'
import { bindLabel, textPx, type WireElement } from '../../../core/ui'

const n = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? Math.floor(v) : d)
const Lines = ({ count = 3 }: { count?: number }) => (
  <div className="wf-lines">
    {Array.from({ length: count }, (_, i) => <i key={i} style={{ width: `${[92, 78, 60, 85, 70][i % 5]}%` }} />)}
  </div>
)
const Cross = () => (
  <svg className="wf-cross" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" y1="0" x2="100" y2="100" vectorEffect="non-scaling-stroke" />
    <line x1="100" y1="0" x2="0" y2="100" vectorEffect="non-scaling-stroke" />
  </svg>
)

/** The low-fi drawing of one wireframe element, in artboard px (the board is scaled as a whole). */
export function ElementBody({ el, project, preview }: { el: WireElement; project: Project; preview?: boolean }) {
  const px = textPx(el)
  const bound = bindLabel(project, el.bind)
  const text = el.text ?? ''
  const style = { fontSize: px }
  switch (el.kind) {
    case 'panel':
      return <div className="wf-panel">{text && <div className="wf-panel-title" style={{ fontSize: Math.min(px, 20) }}>{text}</div>}</div>
    case 'divider':
      return <div className="wf-divider" />
    case 'spacer':
      return preview ? null : <div className="wf-spacer" />
    case 'heading':
    case 'label':
      return <div className={`wf-text wf-${el.kind}`} style={style}>{text || (el.kind === 'heading' ? 'Heading' : 'Label')}</div>
    case 'text':
      return text ? <div className="wf-text wf-para" style={style}>{text}</div> : <Lines count={Math.max(1, Math.min(6, Math.round(el.h / (px * 1.6))))} />
    case 'button':
      return <div className={`wf-button v-${String(el.props?.variant ?? 'Primary').toLowerCase()}`} style={style}>{text || 'Button'}</div>
    case 'iconButton':
      return <div className="wf-button v-secondary wf-iconbtn">★</div>
    case 'toggle':
      return <div className="wf-toggle"><i /></div>
    case 'checkbox':
      return <div className="wf-check" style={style}><i />{text}</div>
    case 'slider':
      return <div className="wf-slider"><i /><b /></div>
    case 'dropdown':
      return <div className="wf-field" style={style}><span>{text}</span><span>▾</span></div>
    case 'input':
      return <div className="wf-field muted" style={style}><span>{text}</span></div>
    case 'tabs':
      return (
        <div className="wf-tabs">
          {Array.from({ length: n(el.props?.tabs, 3) }, (_, i) => <span key={i} className={i === 0 ? 'on' : ''}>Tab {i + 1}</span>)}
        </div>
      )
    case 'list':
      return (
        <div className="wf-list">
          {Array.from({ length: n(el.props?.rows, 5) }, (_, i) => <div key={i}><i /></div>)}
        </div>
      )
    case 'grid': {
      const rows = n(el.props?.rows, 4)
      const cols = n(el.props?.cols, 6)
      return (
        <div className="wf-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {Array.from({ length: Math.min(rows * cols, 400) }, (_, i) => <i key={i} />)}
        </div>
      )
    }
    case 'image':
    case 'portrait':
      return <div className={`wf-image ${el.kind === 'portrait' ? 'round' : ''}`}><Cross /></div>
    case 'icon':
      return <div className="wf-circle" />
    case 'tooltip':
      return <div className="wf-tooltip" style={style}>{text}</div>
    case 'statBar':
      return (
        <div className="wf-stat">
          <i />
          <span style={{ fontSize: Math.min(px, el.h * 0.7) }}>{bound || 'Stat'}</span>
        </div>
      )
    case 'counter':
      return <div className="wf-counter" style={style}><i />123 <span className="muted">{bound}</span></div>
    case 'clock':
      return <div className="wf-circle wf-clock"><i /></div>
    case 'minimap':
      return <div className="wf-circle wf-minimap"><span>N</span></div>
    case 'hotbar':
      return (
        <div className="wf-hotbar">
          {Array.from({ length: n(el.props?.slots, 8) }, (_, i) => <span key={i}>{(i + 1) % 10}</span>)}
        </div>
      )
    case 'questTracker':
      return (
        <div className="wf-quest" style={{ fontSize: Math.min(px, 20) }}>
          <b>{bound || 'Active quest'}</b>
          <Lines count={2} />
        </div>
      )
    case 'toast':
      return <div className="wf-toast" style={style}>{text}</div>
    case 'crosshair':
      return <div className="wf-crosshair" />
    case 'dialog':
      return (
        <div className="wf-dialog" style={style}>
          <b>{text || 'Speaker'}</b>
          <Lines count={2} />
          <div className="wf-choices"><span>Choice A</span><span>Choice B</span></div>
        </div>
      )
    default:
      return <div className="wf-panel" />
  }
}
