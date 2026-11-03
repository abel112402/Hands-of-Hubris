import { useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { GraphData, SectionDef } from '../../core/model/types'
import { makeId } from '../../core/model/project'
import { resolveSource } from '../../core/references/refs'
import { useProject, useSection } from '../hooks'

type GSec = Extract<SectionDef, { kind: 'graph' }>

const hue = (s: string) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function CardNode({ data, selected }: NodeProps) {
  const d = data as { label: string; kind: string; tag?: string }
  return (
    <div className={'gnode' + (selected ? ' selected' : '')} style={{ borderColor: `hsl(${hue(d.kind)},60%,55%)` }}>
      <Handle type="target" position={Position.Left} />
      <div className="gnode-kind" style={{ color: `hsl(${hue(d.kind)},70%,70%)` }}>{d.kind}{d.tag ? ` · ${d.tag}` : ''}</div>
      <div className="gnode-label">{d.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
const nodeTypes = { card: CardNode }

/** Simple layered layout: depth = longest path from a root. */
function autoLayout(g: GraphData): Record<string, { x: number; y: number }> {
  const depth = new Map<string, number>()
  const incoming = new Map<string, string[]>()
  g.nodes.forEach((n) => incoming.set(n.id, []))
  g.edges.forEach((e) => incoming.get(e.target)?.push(e.source))
  const visiting = new Set<string>()
  const d = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!
    if (visiting.has(id)) return 0
    visiting.add(id)
    const v = Math.max(-1, ...(incoming.get(id) ?? []).map(d)) + 1
    visiting.delete(id)
    depth.set(id, v)
    return v
  }
  const perLayer = new Map<number, number>()
  const out: Record<string, { x: number; y: number }> = {}
  for (const n of g.nodes) {
    const layer = d(n.id)
    const idx = perLayer.get(layer) ?? 0
    perLayer.set(layer, idx + 1)
    out[n.id] = { x: layer * 260, y: idx * 100 }
  }
  return out
}

export function GraphEditor({ docId, sec }: { docId: string; sec: GSec }) {
  const { data, update } = useSection<GraphData>(docId, sec.id)
  const project = useProject()
  const g = data ?? { nodes: [], edges: [] }
  const [sel, setSel] = useState<{ type: 'node' | 'edge'; id: string } | null>(null)
  const [newKind, setNewKind] = useState(sec.nodeKinds[0])
  const [newRef, setNewRef] = useState('')
  const sourceItems = useMemo(() => (sec.nodeSource ? resolveSource(project, docId, sec.nodeSource) : []), [project, docId, sec.nodeSource])
  const refIsLabel = !!sec.nodeSource && !('catalog' in sec.nodeSource)

  const nodes: Node[] = g.nodes.map((n) => {
    const ref = sourceItems.find((i) => i.id === n.refId)
    return {
      id: n.id,
      type: 'card',
      position: { x: n.x, y: n.y },
      selected: sel?.type === 'node' && sel.id === n.id,
      data: { label: refIsLabel && ref ? ref.label : n.label, kind: n.kind, tag: !refIsLabel && ref ? ref.label : undefined },
    }
  })
  const edges: Edge[] = g.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || e.kind,
    selected: sel?.type === 'edge' && sel.id === e.id,
    markerEnd: { type: MarkerType.ArrowClosed },
  }))

  const onNodesChange = (changes: NodeChange[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position) {
        const { x, y } = c.position
        update((d) => {
          const n = d.nodes.find((q) => q.id === c.id)
          if (n) {
            n.x = x
            n.y = y
          }
        }, `pos-${c.id}`)
      }
    }
  }
  const onEdgesChange = (changes: EdgeChange[]) => void changes
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return
    const id = makeId()
    update((d) => void d.edges.push({ id, source: c.source!, target: c.target!, kind: sec.edgeKinds?.[0] }))
    setSel({ type: 'edge', id })
  }

  const addNode = () => {
    const id = makeId()
    const ref = sourceItems.find((i) => i.id === newRef)
    update((d) => {
      d.nodes.push({
        id,
        kind: newKind,
        label: refIsLabel && ref ? ref.label : `New ${newKind.toLowerCase()}`,
        refId: newRef || undefined,
        x: 40 + (d.nodes.length % 5) * 40,
        y: 40 + (d.nodes.length % 7) * 50,
      })
    })
    setSel({ type: 'node', id })
  }
  const layout = () => {
    const pos = autoLayout(g)
    update((d) => d.nodes.forEach((n) => void ((n.x = pos[n.id].x), (n.y = pos[n.id].y))))
  }
  const removeNode = (id: string) => {
    update((d) => {
      d.nodes = d.nodes.filter((n) => n.id !== id)
      d.edges = d.edges.filter((e) => e.source !== id && e.target !== id)
    })
    setSel(null)
  }
  const removeEdge = (id: string) => {
    update((d) => void (d.edges = d.edges.filter((e) => e.id !== id)))
    setSel(null)
  }

  const node = sel?.type === 'node' ? g.nodes.find((n) => n.id === sel.id) : undefined
  const edge = sel?.type === 'edge' ? g.edges.find((e) => e.id === sel.id) : undefined

  return (
    <div className="graph-editor">
      <div className="toolbar">
        <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
          {sec.nodeKinds.map((k) => <option key={k}>{k}</option>)}
        </select>
        {sec.nodeSource && (
          <select value={newRef} onChange={(e) => setNewRef(e.target.value)} title={refIsLabel ? 'Create node from item' : 'Tag node with'}>
            <option value="">{refIsLabel ? '(free node)' : '(no tag)'}</option>
            {sourceItems.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        )}
        <button className="primary" onClick={addNode}>+ Add node</button>
        <button onClick={layout}>Auto layout</button>
        <span className="muted">Drag from a node’s right handle to another node to connect. Select + Delete to remove.</span>
      </div>
      <div className="graph-body">
        <div className="graph-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSel({ type: 'node', id: n.id })}
            onEdgeClick={(_, e) => setSel({ type: 'edge', id: e.id })}
            onPaneClick={() => setSel(null)}
            onNodesDelete={(ns) => ns.forEach((n) => removeNode(n.id))}
            onEdgesDelete={(es) => es.forEach((e) => removeEdge(e.id))}
            colorMode="dark"
            fitView
            deleteKeyCode={['Delete', 'Backspace']}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
        {(node || edge) && (
          <aside className="inspector">
            {node && (
              <div className="form">
                <div className="inspector-head"><strong>Node</strong><span className="spacer" /><button className="small danger" onClick={() => removeNode(node.id)}>Delete</button></div>
                <div className="field"><label>Label</label><input value={node.label} onChange={(e) => update((d) => void (d.nodes.find((n) => n.id === node.id)!.label = e.target.value), `nl-${node.id}`)} /></div>
                <div className="field"><label>Kind</label>
                  <select value={node.kind} onChange={(e) => update((d) => void (d.nodes.find((n) => n.id === node.id)!.kind = e.target.value))}>
                    {sec.nodeKinds.map((k) => <option key={k}>{k}</option>)}
                  </select>
                </div>
                {sec.nodeSource && (
                  <div className="field"><label>{refIsLabel ? 'Linked item' : 'Tag'}</label>
                    <select value={node.refId ?? ''} onChange={(e) => update((d) => void (d.nodes.find((n) => n.id === node.id)!.refId = e.target.value || undefined))}>
                      <option value="">—</option>
                      {sourceItems.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
                      {node.refId && !sourceItems.some((i) => i.id === node.refId) && <option value={node.refId}>⚠ missing</option>}
                    </select>
                  </div>
                )}
                <div className="field"><label>Notes</label><textarea rows={5} value={node.notes ?? ''} onChange={(e) => update((d) => void (d.nodes.find((n) => n.id === node.id)!.notes = e.target.value), `nn-${node.id}`)} /></div>
              </div>
            )}
            {edge && (
              <div className="form">
                <div className="inspector-head"><strong>Connection</strong><span className="spacer" /><button className="small danger" onClick={() => removeEdge(edge.id)}>Delete</button></div>
                {sec.edgeKinds && (
                  <div className="field"><label>Type</label>
                    <select value={edge.kind ?? ''} onChange={(e) => update((d) => void (d.edges.find((x) => x.id === edge.id)!.kind = e.target.value || undefined))}>
                      <option value="">—</option>
                      {sec.edgeKinds.map((k) => <option key={k}>{k}</option>)}
                    </select>
                  </div>
                )}
                <div className="field"><label>Label (overrides type)</label><input value={edge.label ?? ''} onChange={(e) => update((d) => void (d.edges.find((x) => x.id === edge.id)!.label = e.target.value), `el-${edge.id}`)} /></div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
