import type { ReactNode } from 'react'
import type { Tool } from './MapStage'

/** Line icons for the map tool rail and toolbar, drawn on a 20×20 grid in the current text colour. */
const PATHS: Record<Tool | 'panel' | 'expand' | 'shrink' | 'view' | 'download' | 'dice', ReactNode> = {
  select: <path d="M5 3l11 7-5 1.5L8.5 17z" />,
  mask: <rect x="3.5" y="4.5" width="13" height="11" rx="1" strokeDasharray="3 2.2" />,
  carve: <path d="M4 16l6.5-6.5M9 5.5c2.5-2 5.5-2 7.5 0-2 .5-3.5 2-4 4M8 7l5 5" />,
  fill: (
    <>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
      <path d="M3.5 11l7.5-7.5M7 16.5l9.5-9.5M12 16.5l4.5-4.5" />
    </>
  ),
  walk: (
    <>
      <ellipse cx="7" cy="7" rx="2.2" ry="3.2" />
      <ellipse cx="13" cy="11.5" rx="2.2" ry="3.2" />
      <path d="M6 12.5h2M12 17h2" />
    </>
  ),
  block: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M5.4 14.6l9.2-9.2" />
    </>
  ),
  clear: <path d="M3.5 13.5l7-7 6 6-4 4h-6zM8 16.5h8.5" />,
  redraw: <path d="M3 15c2.5-5 5-5 6.5-2s4 3 7.5-5M14 3.5l2.5 2.5" />,
  split: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="14" r="2.2" />
      <path d="M8 7.2l9 6.3M8 12.8l9-6.3" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M12 4v12" />
    </>
  ),
  expand: <path d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4" />,
  shrink: <path d="M8 4v4H4M12 4v4h4M8 16v-4H4M12 16v-4h4" />,
  view: (
    <>
      <path d="M2.5 10s3-5.5 7.5-5.5 7.5 5.5 7.5 5.5-3 5.5-7.5 5.5S2.5 10 2.5 10z" />
      <circle cx="10" cy="10" r="2.3" />
    </>
  ),
  download: <path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12" />,
  dice: (
    <>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" />
      <circle cx="7.3" cy="7.3" r=".9" fill="currentColor" />
      <circle cx="12.7" cy="12.7" r=".9" fill="currentColor" />
      <circle cx="10" cy="10" r=".9" fill="currentColor" />
    </>
  ),
}

export type ToolIconName = keyof typeof PATHS

export function ToolIcon({ name }: { name: ToolIconName }) {
  return (
    <svg className="loc-ico" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
