import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { GROUPS, MODULES, getSections } from '../../core/modules/registry'
import { useStore } from '../../core/store/store'
import { deleteSnapshot, listSnapshots, readAutosave, type Snapshot } from '../../core/persistence/autosave'
import { deserializeProject } from '../../core/persistence/serialize'
import { restoreAutosave } from '../actions'

function progress(doc: { data: Record<string, any> } | undefined, total: number) {
  if (!doc) return 0
  const filled = Object.values(doc.data).filter((v) =>
    Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.values(v).some((x) => (Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : x !== '' && x != null)) : !!v,
  ).length
  return total ? Math.round((filled / total) * 100) : 0
}

export function Home() {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const [q, setQ] = useState('')
  const [auto, setAuto] = useState<string | null>(null)
  const [snaps, setSnaps] = useState<Snapshot[]>([])
  const refresh = () => void listSnapshots().then(setSnaps)
  useEffect(() => {
    void readAutosave().then((a) => setAuto(a ? new Date(a.savedAt).toLocaleString() : null))
    refresh()
  }, [])
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase())

  return (
    <div className="page home">
      <h1>{t('home.title')}</h1>
      <p className="muted">{t('home.subtitle')}</p>
      {auto && (
        <div className="banner">
          {t('home.restoreBanner', { date: auto })} <button onClick={() => void restoreAutosave()}>{t('actions.restore')}</button>
        </div>
      )}
      <input className="search" placeholder={t('home.filter')} value={q} onChange={(e) => setQ(e.target.value)} />
      {GROUPS.map((g) => {
        const mods = MODULES.filter((m) => m.group === g.id && (match(m.title) || match(m.summary)))
        if (!mods.length) return null
        return (
          <section key={g.id}>
            <h2>{g.label}</h2>
            <div className="cards">
              {mods.map((m) => {
                const p = progress(project.documents[m.id], getSections(m, project.registry).length)
                return (
                  <Link key={m.id} className="card module-card" to={`/doc/${m.id}`}>
                    <div className="icon">{m.icon}</div>
                    <strong>{m.title}</strong>
                    <span className="muted">{m.summary}</span>
                    <div className="bar"><div style={{ width: `${p}%` }} /></div>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
      {snaps.length > 0 && (
        <section>
          <h2>Snapshots</h2>
          <ul className="list">
            {snaps.map((s) => (
              <li key={s.savedAt}>
                <span>{s.name} <span className="muted">{new Date(s.savedAt).toLocaleString()}</span></span>
                <span className="spacer" />
                <button onClick={() => { if (confirm('Load this snapshot?')) useStore.getState().loadProject(deserializeProject(s.json).project) }}>Load</button>
                <button className="danger" onClick={() => void deleteSnapshot(s.savedAt).then(refresh)}>Delete</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
