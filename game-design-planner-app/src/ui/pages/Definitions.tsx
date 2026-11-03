import { useState } from 'react'
import type { FieldDef, FieldType } from '../../core/model/types'
import { makeId } from '../../core/model/project'
import { MODULES, getSections } from '../../core/modules/registry'
import { useStore } from '../../core/store/store'

const TYPES: FieldType[] = ['text', 'longtext', 'number', 'boolean', 'enum', 'color', 'list']
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || makeId()

export function Definitions() {
  const project = useStore((s) => s.project)
  const mutate = useStore((s) => s.mutate)
  const reg = project.registry
  const [newCat, setNewCat] = useState('')
  const [newType, setNewType] = useState('')
  const collections = MODULES.flatMap((m) =>
    getSections(m, reg).filter((s) => s.kind === 'collection').map((s) => ({ key: `${m.id}/${s.id}`, label: `${m.title} › ${s.title}` })),
  )
  const [target, setTarget] = useState(collections[0]?.key ?? '')
  const [fname, setFname] = useState('')
  const [ftype, setFtype] = useState<FieldType>('text')

  const makeField = (label: string, type: FieldType): FieldDef =>
    (type === 'enum' ? { key: slugify(label), label, type, options: ['A', 'B'] } : { key: slugify(label), label, type }) as FieldDef

  return (
    <div className="page defs">
      <h1>Definitions</h1>
      <p className="muted">Extend the game: add catalog entries (stats, needs, resources…), custom fields and your own entity types. Everything is stored in the project file.</p>

      <h2>Catalogs</h2>
      {Object.entries(reg.catalogs).map(([cid, cat]) => (
        <details key={cid} className="card">
          <summary><strong>{cat.label}</strong> <span className="muted">({cat.items.length})</span></summary>
          <ul className="list">
            {cat.items.map((it) => (
              <li key={it.id}>
                <input value={it.label} onChange={(e) => mutate((p) => void (p.registry.catalogs[cid].items.find((i) => i.id === it.id)!.label = e.target.value), `cat-${it.id}`)} />
                <code className="muted">{it.id}</code>
                <button className="small danger" onClick={() => mutate((p) => void (p.registry.catalogs[cid].items = p.registry.catalogs[cid].items.filter((i) => i.id !== it.id)))}>✕</button>
              </li>
            ))}
          </ul>
          <button onClick={() => mutate((p) => void p.registry.catalogs[cid].items.push({ id: `${slugify('item')}_${makeId().slice(0, 4)}`, label: 'New item' }))}>+ Add item</button>
        </details>
      ))}
      <div className="row">
        <input placeholder="New catalog name" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
        <button disabled={!newCat} onClick={() => { mutate((p) => void (p.registry.catalogs[slugify(newCat)] = { label: newCat, items: [] })); setNewCat('') }}>+ Add catalog</button>
      </div>

      <h2>Custom fields</h2>
      <div className="row">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {collections.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input placeholder="Field name" value={fname} onChange={(e) => setFname(e.target.value)} />
        <select value={ftype} onChange={(e) => setFtype(e.target.value as FieldType)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <button disabled={!fname || !target} onClick={() => { mutate((p) => void (p.registry.customFields[target] ??= []).push(makeField(fname, ftype))); setFname('') }}>+ Add field</button>
      </div>
      <ul className="list">
        {Object.entries(reg.customFields).flatMap(([k, fs]) => fs.map((f) => (
          <li key={k + f.key}><span>{k}</span><strong>{f.label}</strong><span className="muted">{f.type}</span><span className="spacer" />
            <button className="small danger" onClick={() => mutate((p) => void (p.registry.customFields[k] = p.registry.customFields[k].filter((x) => x.key !== f.key)))}>✕</button></li>
        )))}
      </ul>

      <h2>Custom entity types</h2>
      {reg.entityTypes.map((t) => (
        <div key={t.id} className="card">
          <div className="row">
            <input value={t.name} onChange={(e) => mutate((p) => void (p.registry.entityTypes.find((x) => x.id === t.id)!.name = e.target.value), `et-${t.id}`)} />
            <button className="small danger" onClick={() => confirm('Delete type? Existing entities stay in the file.') && mutate((p) => void (p.registry.entityTypes = p.registry.entityTypes.filter((x) => x.id !== t.id)))}>Delete</button>
          </div>
          <ul className="list">
            {t.fields.map((f) => (
              <li key={f.key}><strong>{f.label}</strong><span className="muted">{f.type}</span><span className="spacer" />
                <button className="small danger" onClick={() => mutate((p) => void (p.registry.entityTypes.find((x) => x.id === t.id)!.fields = t.fields.filter((x) => x.key !== f.key)))}>✕</button></li>
            ))}
          </ul>
          <div className="row">
            <input placeholder="Field name" value={fname} onChange={(e) => setFname(e.target.value)} />
            <select value={ftype} onChange={(e) => setFtype(e.target.value as FieldType)}>{TYPES.map((x) => <option key={x}>{x}</option>)}</select>
            <button disabled={!fname} onClick={() => { mutate((p) => void p.registry.entityTypes.find((x) => x.id === t.id)!.fields.push(makeField(fname, ftype))); setFname('') }}>+ Add field</button>
          </div>
        </div>
      ))}
      <div className="row">
        <input placeholder="New entity type (e.g. Spell)" value={newType} onChange={(e) => setNewType(e.target.value)} />
        <button disabled={!newType} onClick={() => { mutate((p) => void p.registry.entityTypes.push({ id: slugify(newType), name: newType, fields: [] })); setNewType('') }}>+ Add type</button>
      </div>
    </div>
  )
}
