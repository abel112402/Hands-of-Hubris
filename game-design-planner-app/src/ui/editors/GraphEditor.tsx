import { useMemo, useState } from 'react'
import { addMissingArrows, flowAnalysis, UI_DOC } from '../../core/ui'
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
import type { Entity, GraphData, SectionDef } from '../../core/model/types'
import { makeId } from '../../core/model/project'
import { resolveSource } from '../../core/references/refs'
import { useStore } from '../../core/store/store'
import { useNewlyAdded, useProject, useSection } from '../hooks'

type GSec = Extract<SectionDef, { kind: 'graph' }>

const hue = (s: string) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function CardNode({ data, selected }: NodeProps) {
  const d = data as { label: string; kind: string; tag?: string; dim?: boolean }
  return (
    <div className={'gnode' + (selected ? ' selected' : '') + (d.dim ? ' dim' : '')} style={{ borderColor: `hsl(${hue(d.kind)},60%,55%)` }}>
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
  const [highlight, setHighlight] = useState('')
  const mutate = useStore((s) => s.mutate)
  const linkItems: Entity[] = sec.links ? project.documents[docId]?.data[sec.links.section] ?? [] : []
  const lit = new Set<string>(highlight && sec.links ? linkItems.find((e) => e.id === highlight)?.[sec.links.field] ?? [] : [])
  const dimmed = (id: string) => !!highlight && !lit.has(id)
  const sourceItems = useMemo(() => (sec.nodeSource ? resolveSource(project, docId, sec.nodeSource) : []), [project, docId, sec.nodeSource])
  const refIsLabel = !!sec.nodeSource && !('catalog' in sec.nodeSource)

  // A node that was just added (or brought back by undo) pops in; existing ones never animate.
  const fresh = useNewlyAdded(g.nodes.map((n) => n.id), 500)
  const nodes: Node[] = g.nodes.map((n) => {
    const ref = sourceItems.find((i) => i.id === n.refId)
    return {
      id: n.id,
      type: 'card',
      className: fresh.has(n.id) ? 'node-new' : undefined,
      position: { x: n.x, y: n.y },
      selected: sel?.type === 'node' && sel.id === n.id,
      data: { label: refIsLabel && ref ? ref.label : n.label, kind: n.kind, tag: !refIsLabel && ref ? ref.label : undefined, dim: dimmed(n.id) },
    }
  })
  const edges: Edge[] = g.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || e.kind,
    selected: sel?.type === 'edge' && sel.id === e.id,
    style: dimmed(e.source) || dimmed(e.target) ? { opacity: 0.2 } : undefined,
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
    const links = sec.links
    if (links)
      mutate((p) => {
        for (const e of (p.documents[docId]?.data[links.section] ?? []) as Entity[])
          if (Array.isArray(e[links.field])) e[links.field] = e[links.field].filter((x: string) => x !== id)
      })
    setSel(null)
  }
  const removeEdge = (id: string) => {
    update((d) => void (d.edges = d.edges.filter((e) => e.id !== id)))
    setSel(null)
  }

  const edgeItems = useMemo(() => (sec.edgeSource ? resolveSource(project, docId, sec.edgeSource) : []), [project, docId, sec.edgeSource])
  const labelOf = (id: string) => g.nodes.find((n) => n.id === id)?.label ?? '?'
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
        {docId === UI_DOC && sec.id === 'flow' && (() => {
          const missing = flowAnalysis(project).missingInGraph.length
          return (
            <button disabled={!missing} title="Add an arrow for every wireframe button that opens a screen the graph does not connect yet" onClick={() => mutate(addMissingArrows)}>
              Add arrows from wireframes{missing ? ` (${missing})` : ''}
            </button>
          )
        })()}
        {sec.links && (
          <select aria-label="Highlight" value={highlight} onChange={(e) => setHighlight(e.target.value)} title="Dim everything outside one entry">
            <option value="">Highlight: all</option>
            {linkItems.map((e) => <option key={e.id} value={e.id}>{e.name || '(unnamed)'}</option>)}
          </select>
        )}
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
          <aside key={sel?.id} className="inspector">
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
                <p className="muted">
                  {g.edges.some((e) => e.target === node.id)
                    ? `Reached from ${g.edges.filter((e) => e.target === node.id).map((e) => `${labelOf(e.source)}${e.kind ? ` (${e.kind})` : ''}`).join(', ')}.`
                    : 'No incoming connection: nothing unlocks this yet.'}
                </p>
                {sec.links && (
                  <div className="field"><label>{sec.links.label}</label>
                    <div className="link-list">
                      {linkItems.length === 0 && <span className="muted">None yet.</span>}
                      {linkItems.map((e) => (
                        <label key={e.id}>
                          <input
                            type="checkbox"
                            checked={(e[sec.links!.field] ?? []).includes(node.id)}
                            onChange={(ev) =>
                              mutate((p) => {
                                const target = (p.documents[docId]?.data[sec.links!.section] ?? []).find((x: Entity) => x.id === e.id)
                                if (!target) return
                                const cur: string[] = target[sec.links!.field] ?? []
                                target[sec.links!.field] = ev.target.checked ? [...cur, node.id] : cur.filter((x) => x !== node.id)
                              })
                            }
                          />{' '}
                          {e.name || '(unnamed)'}
                        </label>
                      ))}
                    </div>
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
                {sec.edgeSource && (
                  <div className="field"><label>Condition</label>
                    <select value={edge.refId ?? ''} onChange={(e) => update((d) => void (d.edges.find((x) => x.id === edge.id)!.refId = e.target.value || undefined))}>
                      <option value="">—</option>
                      {edgeItems.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
                      {edge.refId && !edgeItems.some((i) => i.id === edge.refId) && <option value={edge.refId}>⚠ missing</option>}
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
