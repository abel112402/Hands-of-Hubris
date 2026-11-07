import { guideOf } from '../../modules/guides'
import { useGuideUi } from './guideStore'

/** Empty collection: what the section is for and how to start, instead of a bare “nothing here”. */
export function GuideEmpty({ docId, sectionId, singular, onAdd }: { docId: string; sectionId: string; singular: string; onAdd: () => void }) {
  const guide = guideOf(docId)
  const text = guide?.empty[sectionId]
  const hasExamples = !!guide?.examples.some((e) => e.section === sectionId)
  // The empty state owns the first Add (and example) button; the toolbar shows its Add only once there are items.
  // data-guide keeps the guide spotlight pointing at the visible button.
  return (
    <div className="empty guide-empty">
      <p>{text ?? `Nothing here yet.`}</p>
      <div className="hint-actions">
        <button className="primary" data-guide="add" onClick={onAdd}>+ Add {singular}</button>
        {hasExamples && <button data-guide="examples" onClick={() => useGuideUi.getState().openPicker(sectionId)}>Insert example…</button>}
      </div>
    </div>
  )
}
