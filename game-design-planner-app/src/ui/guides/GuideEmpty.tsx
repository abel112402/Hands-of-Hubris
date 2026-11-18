import { useTranslation } from 'react-i18next'
import { guideOf } from '../../modules/guides'
import { useGuideUi } from './guideStore'
import { useFlavor } from '../flavor/Flavor'
import { HubiSays } from '../mascots/Mascot'
import { costumeFor } from '../../core/mascots/cast'

/** Empty collection: what the section is for and how to start, instead of a bare “nothing here”. */
export function GuideEmpty({ docId, sectionId, singular, onAdd }: { docId: string; sectionId: string; singular: string; onAdd: () => void }) {
  const { t } = useTranslation()
  const guide = guideOf(docId)
  const text = guide?.empty[sectionId]
  const hasExamples = !!guide?.examples.some((e) => e.section === sectionId)
  // Hubi says the empty-state aside, dressed for this planner.
  const line = useFlavor({ keys: [`flavor.empty.${docId.split('.').pop()}`, 'flavor.empty.generic'], ctx: `${docId}/${sectionId}` })
  // The empty state owns the first Add (and example) button; the toolbar shows its Add only once there are items.
  // data-guide keeps the guide spotlight pointing at the visible button.
  return (
    <div className="empty guide-empty">
      <p>{text ?? t('guide.empty')}</p>
      <HubiSays costume={costumeFor(docId)} pose="point">{line}</HubiSays>
      <div className="hint-actions">
        <button className="primary" data-guide="add" onClick={onAdd}>{t('guide.add', { singular })}</button>
        {hasExamples && <button data-guide="examples" onClick={() => useGuideUi.getState().openPicker(sectionId)}>{t('guide.insertExample')}</button>}
      </div>
    </div>
  )
}
