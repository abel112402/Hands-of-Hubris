import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../core/store/store'
import { textOf } from '../../core/walkthrough/compose'
import { setStepManual } from '../../core/walkthrough/evaluate'
import { stepsForPage } from '../../core/walkthrough/focus'
import { stepLink } from '../../core/walkthrough/project'
import { useWalkthrough } from './useWalkthrough'
import { Flavor } from '../flavor/Flavor'

/**
 * On a planner page: the walkthrough step this page is for, its status, and the way back or on.
 * Once the page's step is done it points to the next step, so the walkthrough continues from the editor.
 */
export function WalkthroughChip({ docId, sectionId }: { docId: string; sectionId?: string }) {
  const { t, i18n } = useTranslation()
  const { walk, progress } = useWalkthrough()
  const readOnly = useStore((s) => s.readOnly)
  const here = stepsForPage(walk, docId, sectionId)
  if (!here.length) return null
  const open = here.find((s) => progress.status[s.id] === 'open')
  const next = progress.next
  const nextLink = next && stepLink(next.target)

  if (open) {
    return (
      <div className="walk-chip" role="status">
        <span className="walk-chip-label">{t('workspace.chip.step')}</span>
        <strong>{textOf(open.title, i18n.language)}</strong>
        <span className="spacer" />
        <button className="small" disabled={readOnly} onClick={() => useStore.getState().mutate((p) => setStepManual(p, open.id, true))}>{t('workspace.markDone')}</button>
        <Link className="button small" to="/">{t('workspace.chip.back')}</Link>
      </div>
    )
  }
  return (
    <div className="walk-chip done" role="status">
      <span className="walk-chip-label">✓ {t('workspace.chip.done')}</span>
      <Flavor as="span" keys="flavor.stepDone" ctx={`${docId}/${sectionId ?? ''}`} />
      <span className="spacer" />
      {next && nextLink ? (
        <Link className="button small primary" to={nextLink}>{t('workspace.chip.next', { step: textOf(next.title, i18n.language) })}</Link>
      ) : (
        <Link className="button small" to="/">{t('workspace.chip.back')}</Link>
      )}
    </div>
  )
}
