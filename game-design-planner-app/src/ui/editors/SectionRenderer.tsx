import type { SectionDef } from '../../core/model/types'
import { CollectionEditor } from './CollectionEditor'
import { GraphEditor } from './GraphEditor'
import { CanvasEditor } from './CanvasEditor'
import { ChecklistEditor, FormEditor, FormulaEditor, MatrixEditor, RichTextEditor } from './simple'

export function SectionRenderer({ docId, sec }: { docId: string; sec: SectionDef }) {
  switch (sec.kind) {
    case 'form': return <FormEditor docId={docId} sec={sec} />
    case 'collection': return <CollectionEditor docId={docId} sec={sec} />
    case 'matrix': return <MatrixEditor docId={docId} sec={sec} />
    case 'graph': return <GraphEditor docId={docId} sec={sec} />
    case 'canvas': return <CanvasEditor docId={docId} sec={sec} />
    case 'checklist': return <ChecklistEditor docId={docId} sec={sec} />
    case 'richtext': return <RichTextEditor docId={docId} sec={sec} />
    case 'formulas': return <FormulaEditor docId={docId} sec={sec} />
  }
}
