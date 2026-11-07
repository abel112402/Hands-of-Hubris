import { Link } from 'react-router-dom'
import { pillarCoverage, pitchCheck, SCOPE_BUCKETS, scopeList, visionReadiness, VISION_DOC } from '../../core/vision'
import type { Entity } from '../../core/model/types'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const bucketOf = (e: Entity) => (SCOPE_BUCKETS as readonly string[]).includes(e.bucket) ? (e.bucket as string) : 'Undecided'

/**
 * Scope items (rows) against design pillars (columns). Click a cell to link or unlink a pillar.
 * A planning aid: an item with no pillar, or a pillar with no item, is a question to answer, not an error.
 */
export function PillarMatrixView({ items, selected, onSelect, patch }: ViewProps) {
  const project = useProject()
  const coverage = pillarCoverage(project)
  if (!coverage.length) return <p className="empty">Add design pillars first; then tag each scope item with the pillars it serves.</p>
  // `items` is the (filtered) scope list of this section.
  const rows = [...SCOPE_BUCKETS, 'Undecided'].map((b) => ({ bucket: b, list: items.filter((e) => bucketOf(e) === b) })).filter((g) => g.list.length)
  const toggle = (e: Entity, pillarId: string) => {
    const cur = ids(e.pillars)
    const next = cur.includes(pillarId) ? cur.filter((x) => x !== pillarId) : [...cur, pillarId]
    patch(e.id, 'pillars', next.length ? next : undefined)
  }
  return (
    <div className="stack">
      <p className="muted">Planning aid, not a verdict. Click a cell to link a scope item to a pillar. Dashed rows serve no pillar yet.</p>
      <div className="table-wrap">
        <table className="grid vision-matrix">
          <thead>
            <tr>
              <th>Scope item</th>
              {coverage.map((c) => (
                <th key={c.pillar.id} title={c.pillar.name} style={c.pillar.color ? { borderBottom: `3px solid ${c.pillar.color}` } : undefined}>
                  {c.pillar.name || '(unnamed)'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => [
              <tr key={'h' + g.bucket} className="group">
                <th colSpan={coverage.length + 1}>{g.bucket}</th>
              </tr>,
              ...g.list.map((e) => {
                const mine = ids(e.pillars)
                const loose = !coverage.some((c) => mine.includes(c.pillar.id))
                return (
                  <tr key={e.id} className={(e.id === selected ? 'selected ' : '') + (loose ? 'loose' : '')}>
                    <td className="clickable" onClick={() => onSelect(e.id)}>{e.name || '(unnamed)'}</td>
                    {coverage.map((c) => {
                      const on = mine.includes(c.pillar.id)
                      return (
                        <td
                          key={c.pillar.id}
                          className={'cov-cell' + (on ? ' on' : '')}
                          role="button"
                          tabIndex={0}
                          aria-pressed={on}
                          aria-label={`${e.name || 'item'} serves ${c.pillar.name || 'pillar'}`}
                          onClick={() => toggle(e, c.pillar.id)}
                          onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), toggle(e, c.pillar.id))}
                        >
                          {on ? '●' : ''}
                        </td>
                      )
                    })}
                  </tr>
                )
              }),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <th>Items / in MVP</th>
              {coverage.map((c) => (
                <td key={c.pillar.id} className={'num' + (c.unused ? ' hole' : c.notInMvp ? ' short' : '')}>
                  {c.scope.length} / {c.mvp.length}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {items.length === 0 && scopeList(project).length === 0 && <p className="empty">No scope items yet.</p>}
    </div>
  )
}

const CHAPTER: Record<string, string> = {
  pitch: 'One-sentence pitch',
  references: 'Genre and reference games',
  audience: 'Target audience',
  usps: 'Unique selling points',
  pillars: 'Design pillars',
  tone: 'Mood and tone',
  scope: 'Scope',
  platform: 'Platform and technical frame',
  monetization: 'Monetization / release plan',
}

/** The nine chapters of the vision doc, filled yes/no, plus a shape check of the pitch. */
export function VisionReadinessView() {
  const project = useProject()
  const list = visionReadiness(project)
  const done = list.filter((i) => i.filled).length
  const pitch = String(project.documents[VISION_DOC]?.data.pitch?.pitch ?? '')
  const check = pitchCheck(pitch)
  const PROBLEM: Record<string, string> = {
    empty: 'Write a draft pitch.',
    short: 'Very short: add who plays and why.',
    long: 'Long for one sentence: cut it down.',
    multiSentence: 'More than one sentence.',
    noGoal: 'No goal clause: say what the player is trying to achieve.',
  }
  return (
    <div className="stack">
      <p className="muted">
        {done} of {list.length} chapters have content. Planning estimate only; a draft is fine.
      </p>
      <ul className="vision-readiness">
        {list.map((i) => (
          <li key={i.sectionId} className={i.filled ? 'ok' : ''}>
            <span role="img" aria-label={i.filled ? 'filled' : 'empty'}>{i.filled ? '✓' : '○'}</span>{' '}
            <Link to={`/doc/${VISION_DOC}?s=${i.sectionId}`}>{CHAPTER[i.sectionId]}</Link>
          </li>
        ))}
      </ul>
      <p>
        <strong>Pitch check:</strong> {pitch.trim() ? `${check.words} words. ` : ''}
        {check.problems.length ? check.problems.map((p) => PROBLEM[p]).join(' ') : 'Reads as one sentence.'}
      </p>
    </div>
  )
}
