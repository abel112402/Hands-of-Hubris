import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { textOf } from '../../core/walkthrough/compose'
import { stepLink } from '../../core/walkthrough/project'
import { Icon } from '../Icon'
import { useWalkthrough } from '../workspace/useWalkthrough'

/** The walkthrough's next open step: its title, where it opens, and whether that is the page on screen. */
export function useNextStep(docId?: string, sectionId?: string) {
  const { i18n } = useTranslation()
  const { progress } = useWalkthrough()
  const next = progress.next
  if (!next) return undefined
  const link = stepLink(next.target)
  const here = !!next.target && next.target.docId === docId && (!next.target.section || next.target.section === sectionId)
  return { id: next.id, title: textOf(next.title, i18n.language), link, here }
}

/**
 * The current walkthrough step, always one click away: a round button in the command bar (prototype review:
 * a symmetrical circle with a pulsing dot; the step's title is its tooltip and accessible name).
 */
export function StepButton({ docId, sectionId }: { docId?: string; sectionId?: string }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const step = useNextStep(docId, sectionId)
  if (!step) return null
  const label = t('v3.step.current', { title: step.title })
  return (
    <button type="button" className="step3btn" aria-label={label} title={label} disabled={!step.link} onClick={() => step.link && nav(step.link)}>
      <span className="step3btn-dot" aria-hidden="true" />
    </button>
  )
}

/** "Next step · …" at the bottom of the page; hidden on the step's own page, dismissable until the step changes. */
export function NextStepPill({ docId, sectionId }: { docId?: string; sectionId?: string }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const step = useNextStep(docId, sectionId)
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (!step || !step.link || step.here || dismissed === step.id) return null
  return (
    <div className="pill3" role="region" aria-label={t('v3.step.region')}>
      <button type="button" className="pill3-go" onClick={() => nav(step.link!)}>
        <span className="step3btn-dot" aria-hidden="true" />
        <span className="muted">{t('v3.step.next')}</span>
        <span className="pill3-title">{step.title}</span>
        <Icon name="chevronRight" />
      </button>
      <button type="button" className="pill3-x" aria-label={t('v3.step.hide')} title={t('v3.step.hide')} onClick={() => setDismissed(step.id)}>
        <Icon name="close" />
      </button>
    </div>
  )
}
