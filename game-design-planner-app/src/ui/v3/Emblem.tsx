import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { EmblemFigure, EmblemState } from '../../core/emblem'
import type { PhaseId } from '../../core/walkthrough/types'

/** The phase colour tokens; the last phase is "ship" in the walkthrough and "polish" in the palette. */
const PHASE_VAR: Record<PhaseId, string> = { concept: '--phase-concept', systems: '--phase-systems', content: '--phase-content', production: '--phase-production', ship: '--phase-polish' }

/** One part of the figure: a dashed ghost until its phase starts, then outlined and filled as it fills. */
function partStyle(phase: PhaseId, fill: number): CSSProperties {
  const c = `var(${PHASE_VAR[phase]})`
  if (fill <= 0) return { fill: 'none', stroke: 'var(--muted)', strokeDasharray: '4 4', opacity: 0.6 }
  return { fill: `color-mix(in srgb, ${c} ${Math.round(12 + 70 * fill)}%, transparent)`, stroke: c }
}

/** The figures' parts by phase, drawn back to front (prototype review: knight, camp, castle). */
const FIGURES: Record<EmblemFigure, [PhaseId, ReactNode][]> = {
  knight: [
    ['production', <><path d="M36 56L24 118h72L84 56z" /><path d="M46 100h11v26H43z" /><path d="M63 100h11l3 26H63z" /></>],
    ['systems', <><path d="M40 54h40l-5 48H45z" /><path d="M44 88h32v5H44z" /></>],
    ['concept', <><path d="M46 32a14 14 0 0 1 28 0v18H46z" /><path d="M50 39h20v4H50z" /></>],
    ['content', <><path d="M12 62h26v22c0 12-13 18-13 18s-13-6-13-18z" /><path d="M95 26h6v58h-6z" /><path d="M87 84h22v5H87z" /><path d="M96 89h4v10h-4z" /></>],
    ['ship', <><path d="M60 18c4-10 16-12 22-6-9 1-15 5-22 6z" /><path d="M22 18l3 6-3 6-3-6z" /><path d="M104 104l3 6-3 6-3-6z" /></>],
  ],
  camp: [
    ['ship', <><path d="M30 14a14 14 0 1 0 16 18 11 11 0 0 1-16-18z" /><path d="M70 16l3 6-3 6-3-6z" /><path d="M96 30l3 6-3 6-3-6z" /></>],
    ['production', <><path d="M98 82l10-34 10 34z" /><path d="M106 82h4v12h-4z" /><path d="M2 96l8-26 8 26z" /></>],
    ['concept', <><path d="M14 122L46 58l32 64z" /><path d="M46 122V88l10 34z" /></>],
    ['systems', <><path d="M76 114h32v6H76z" /><path d="M80 108l26 10-2 4-26-10z" /></>],
    ['content', <path d="M92 110c-11-7-6-20 0-32 4 9 13 15 8 25-2 4-5 6-8 7z" />],
  ],
  castle: [
    ['production', <><path d="M8 62h18v58H8z" /><path d="M94 62h18v58H94z" /><path d="M5 62l12-17 12 17z" /><path d="M91 62l12-17 12 17z" /></>],
    ['systems', <><path d="M26 78h68v42H26z" /><path d="M26 72h8v6h-8z" /><path d="M86 72h8v6h-8z" /></>],
    ['concept', <><path d="M47 36h26v84H47z" /><path d="M47 28h6v8h-6z" /><path d="M57 28h6v8h-6z" /><path d="M67 28h6v8h-6z" /></>],
    ['content', <path d="M50 120v-18a10 10 0 0 1 20 0v18z" />],
    ['ship', <><path d="M59 6h2v22h-2z" /><path d="M61 6h22l-6 6 6 6H61z" /></>],
  ],
}

/**
 * Minimal emblem (prototype review): the figure, the rank, a thin progress line and the explored share.
 * What to fill next is the tooltip. The figure follows the project's genre (Settings › Genre).
 */
export function Emblem({ state }: { state: EmblemState }) {
  const { t } = useTranslation()
  const f = state.figure
  const rank = t(`v3.emblem.${f}.ranks.${state.rank}`)
  const built = Object.values(state.parts).filter((v) => v > 0).length
  const next = state.nextPart
    ? t('v3.emblem.next', { phase: t(`walkthrough.phases.${state.nextPart}`), part: t(`v3.emblem.${f}.parts.${state.nextPart}`) }) +
      (state.nextRankAt !== undefined ? ' ' + t('v3.emblem.nextRank', { rank: t(`v3.emblem.${f}.ranks.${state.rank + 1}`), at: state.nextRankAt }) : '')
    : t('v3.emblem.complete')
  return (
    <section className="emblem3" aria-label={t('v3.emblem.label', { rank, pct: state.explored })} title={next}>
      <svg viewBox="0 0 120 140" width="72" height="84" role="img" aria-label={t('v3.emblem.figure', { figure: t(`v3.emblem.${f}.name`), built })}>
        <circle cx="60" cy="72" r="58" style={{ fill: 'color-mix(in srgb, var(--phase-polish) 14%, transparent)', stroke: 'color-mix(in srgb, var(--phase-polish) 50%, transparent)', opacity: state.parts.ship >= 1 ? 1 : state.parts.ship * 0.6 }} />
        {f === 'camp' && <path d="M4 122h112" style={{ stroke: 'var(--line-strong)', fill: 'none' }} />}
        {FIGURES[f].map(([phase, shape]) => (
          <g key={phase} className="emblem3-part" style={partStyle(phase, state.parts[phase])}>{shape}</g>
        ))}
      </svg>
      <div className="emblem3-text">
        <strong className="emblem3-rank">{rank}</strong>
        <span className="emblem3-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, state.explored)}%` }} /></span>
        <span className="muted num">{t('v3.compass.explored', { pct: state.explored })}</span>
      </div>
    </section>
  )
}
