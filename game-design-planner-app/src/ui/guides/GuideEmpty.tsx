import { guideOf } from '../../modules/guides'
import { useGuideUi } from './guideStore'

/** Empty collection: what the section is for and how to start, instead of a bare “nothing here”. */
export function GuideEmpty({ docId, sectionId, singular, onAdd }: { docId: string; sectionId: string; singular: string; onAdd: () => void }) {
  const guide = guideOf(docId)
  const text = guide?.empty[sectionId]
  const hasExamples = !!guide?.examples.some((e) => e.section === sectionId)
  if (!text && !hasExamples) return <p className="empty">Nothing here yet. Use “Add {singular}”.</p>
  return (
    <div className="empty guide-empty">
      {text && <p>{text}</p>}
      <div className="hint-actions">
        <button className="primary" onClick={onAdd}>+ Add {singular}</button>
        {hasExamples && <button onClick={() => useGuideUi.getState().openPicker(sectionId)}>Insert example…</button>}
      </div>
    </div>
  )
}
