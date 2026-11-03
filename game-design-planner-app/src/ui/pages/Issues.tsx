import { Link } from 'react-router-dom'
import { validateProject } from '../../core/references/refs'
import { useStore } from '../../core/store/store'

export function Issues() {
  const project = useStore((s) => s.project)
  const issues = validateProject(project)
  return (
    <div className="page">
      <h1>Issues ({issues.length})</h1>
      {issues.length === 0 && <p className="muted">No problems found.</p>}
      <ul className="list">
        {issues.map((i, n) => (
          <li key={n}>
            <span className={`pill ${i.level}`}>{i.level}</span>
            <Link to={`/doc/${i.docId}?s=${i.sectionId}`}>{i.docTitle} › {i.sectionTitle}</Link>
            <span>{i.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
