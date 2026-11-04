import { useEffect, useLayoutEffect, useState } from 'react'
import type { ModuleGuide } from '../../core/guides/types'
import { useProject } from '../hooks'
import { stepDone, useGuideUi, useManualDone } from './guideStore'
import { useOpenStep } from './GuidePanel'

type Box = { top: number; left: number; width: number; height: number }

/** Coach mark: outlines the step's control and explains it in a popover. Esc or “Got it” closes it. */
export function Spotlight({ docId, guide, sectionId }: { docId: string; guide: ModuleGuide; sectionId?: string }) {
  const spotlight = useGuideUi((s) => s.spotlight)
  const setSpotlight = useGuideUi((s) => s.setSpotlight)
  const project = useProject()
  const manual = useManualDone(project, docId)
  const open = useOpenStep(docId)
  // The measured box is tagged with the target it belongs to, so a stale box is never shown for another step.
  const [measured, setMeasured] = useState<{ key: string; box: Box | null } | null>(null)
  const stepId = spotlight?.startsWith(`${docId}/`) ? spotlight.slice(docId.length + 1) : null
  const step = guide.steps.find((s) => s.id === stepId)
  const active = !!step && step.section === sectionId
  const key = active && step?.target ? `${spotlight}:${step.target}` : null
  const box = measured && measured.key === key ? measured.box : null

  useLayoutEffect(() => {
    if (!key || !step?.target) return
    let el: HTMLElement | null = null
    const measure = () => {
      el = document.querySelector<HTMLElement>(`.content [data-guide="${step.target}"]`)
      if (!el) return setMeasured({ key, box: null })
      const r = el.getBoundingClientRect()
      setMeasured({ key, box: { top: r.top, left: r.left, width: r.width, height: r.height } })
    }
    const frame = requestAnimationFrame(() => {
      measure()
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      el?.classList.add('guide-spot')
      setTimeout(measure, 350)
    })
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(frame)
      el?.classList.remove('guide-spot')
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [key, step?.target])

  useEffect(() => {
    if (!active) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setSpotlight(null)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [active, setSpotlight])

  if (!active || !step) return null
  const idx = guide.steps.indexOf(step)
  const following = guide.steps.slice(idx + 1).find((s) => !stepDone(s, project, manual))
  const style = box
    ? { top: Math.min(window.innerHeight - 180, box.top + box.height + 10), left: Math.max(10, Math.min(window.innerWidth - 340, box.left)) }
    : { top: 90, left: Math.max(10, window.innerWidth / 2 - 160) }
  return (
    <div className="coachmark" role="dialog" aria-label={step.title} style={style}>
      <div className="coachmark-step muted">Step {idx + 1} of {guide.steps.length}</div>
      <strong>{step.title}</strong>
      <p>{step.body}</p>
      <div className="hint-actions">
        <button className="primary" onClick={() => setSpotlight(null)}>Got it</button>
        {following && <button onClick={() => open(following)}>Next: {following.title}</button>}
      </div>
    </div>
  )
}
