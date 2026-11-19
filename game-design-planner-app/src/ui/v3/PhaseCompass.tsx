import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { compassPhases, plannerPhase, type CompassPhase } from '../../core/compass'
import { collectHints, makeContext } from '../../core/hints/engine'
import { getModule } from '../../core/modules/registry'
import { useStore } from '../../core/store/store'
import type { PhaseId } from '../../core/walkthrough/types'
import { Icon, type IconName } from '../Icon'
import { ModuleIcon } from '../ModuleIcon'
import { useWalkthrough } from '../workspace/useWalkthrough'

const PHASE_ICON: Record<PhaseId, IconName> = { concept: 'pen', systems: 'blocks', content: 'map', production: 'wrench', ship: 'rocket' }

/** A small fill ring (0–100), with the number for screen readers in the item's own text. */
export function Ring({ value }: { value: number }) {
  return (
    <svg className="ring3" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.96" className="ring3-track" />
      <circle cx="10" cy="10" r="7.96" className="ring3-fill" style={{ strokeDasharray: `${Math.max(0.01, value / 2)} 50` }} pathLength={50} />
    </svg>
  )
}

/** The planners of one phase, beside its rail button. Closes on Escape, a click outside or opening a planner. */
function Flyout({ group, anchor, onClose }: { group: CompassPhase; anchor: HTMLElement; onClose: () => void }) {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const ref = useRef<HTMLDivElement>(null)
  // Each planner's open hints; worked out only while the flyout is open.
  const hints = useMemo(() => Object.fromEntries(group.planners.map((p) => [p.id, collectHints(makeContext(project, { docId: p.id })).filter((h) => h.target.docId === p.id).length])), [group, project])
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('a')?.focus()
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [anchor, onClose])
  const top = Math.min(anchor.getBoundingClientRect().top, window.innerHeight - 80 - group.planners.length * 40)
  return (
    <div
      ref={ref}
      className="flyout3"
      role="dialog"
      aria-label={t(`walkthrough.phases.${group.phase}`)}
      style={{ top: Math.max(64, top) }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
        anchor.focus()
      }}
    >
      <div className="flyout3-head">
        <span className="eyebrow">{t(`walkthrough.phases.${group.phase}`)}</span>
        <span className="muted">{t('v3.compass.explored', { pct: group.progress })}</span>
      </div>
      <ul>
        {group.planners.map((p) => (
          <li key={p.id}>
            <NavLink to={`/doc/${p.id}`} className="flyout3-item" onClick={onClose}>
              <ModuleIcon id={p.id} />
              <span className="flyout3-title">{p.title}</span>
              {hints[p.id] > 0 && <span className="step3-hints" title={t('v3.section.hints', { count: hints[p.id] })}>{hints[p.id]}</span>}
              <Ring value={p.progress} />
              <span className="sr-only">{t('v3.compass.filled', { pct: p.progress })}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The five walkthrough phases as rail items (labelled line icon, a thin fill track), each opening a flyout of
 * its planners. The phase of the planner on screen is marked, so the rail also says where you are.
 */
export function PhaseCompass({ docId }: { docId?: string }) {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const { walk } = useWalkthrough()
  const groups = useMemo(() => compassPhases(project, walk), [project, walk])
  const [open, setOpen] = useState<{ phase: PhaseId; anchor: HTMLElement } | null>(null)
  const mod = docId ? getModule(docId) : undefined
  const here = mod ? plannerPhase(walk, mod) : undefined
  // Opening a planner (from the flyout or anywhere else) closes the flyout.
  const [seenDoc, setSeenDoc] = useState(docId)
  if (docId !== seenDoc) {
    setSeenDoc(docId)
    setOpen(null)
  }
  return (
    <>
      {groups.map((g) => {
        const label = t(`walkthrough.phases.${g.phase}`)
        const isOpen = open?.phase === g.phase
        return (
          <button
            key={g.phase}
            type="button"
            className={'rail3-item' + (g.phase === here ? ' active' : '') + (isOpen ? ' open' : '')}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            aria-current={g.phase === here ? 'location' : undefined}
            title={`${label} · ${t('v3.compass.explored', { pct: g.progress })}`}
            onClick={(e) => setOpen(isOpen ? null : { phase: g.phase, anchor: e.currentTarget })}
          >
            <span className="rail3-icon"><Icon name={PHASE_ICON[g.phase]} /></span>
            <span className="rail3-label">{label}</span>
            <span className="rail3-track" aria-hidden="true"><span style={{ width: `${g.progress}%` }} /></span>
          </button>
        )
      })}
      {open && <Flyout group={groups.find((g) => g.phase === open.phase)!} anchor={open.anchor} onClose={() => setOpen(null)} />}
    </>
  )
}
