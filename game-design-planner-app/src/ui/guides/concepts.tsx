import { useState } from 'react'
import type { GuideConcept } from '../../core/guides/types'

/** Small static explainer diagrams; colours come from CSS classes so they follow the theme. */
function Diagram({ kind }: { kind: GuideConcept['diagram'] }) {
  switch (kind) {
    case 'decay':
      return (
        <svg viewBox="0 0 320 120" className="concept-svg" role="img" aria-label="A stat draining over time, crossing the critical line, then restored">
          <line x1="30" y1="10" x2="30" y2="100" className="c-axis" />
          <line x1="30" y1="100" x2="310" y2="100" className="c-axis" />
          <rect x="30" y="78" width="280" height="22" className="c-danger-band" />
          <text x="34" y="94" className="c-small">critical</text>
          <polyline points="30,15 150,80 150,30 250,80 250,40 310,63" className="c-line" />
          <text x="4" y="18" className="c-small">max</text>
          <text x="152" y="26" className="c-small">restore</text>
          <text x="250" y="114" className="c-small">time →</text>
          <text x="60" y="40" className="c-small">decay × difficulty</text>
        </svg>
      )
    case 'pipeline':
      return (
        <svg viewBox="0 0 340 70" className="concept-svg" role="img" aria-label="XP sources feed the curve, levels give points, points buy skills">
          {['XP sources', 'XP curve', 'Level', 'Skill points', 'Skills'].map((t, i) => (
            <g key={t} transform={`translate(${i * 68},18)`}>
              <rect width="60" height="30" rx="5" className="c-box" />
              <text x="30" y="19" textAnchor="middle" className="c-small">{t}</text>
              {i < 4 && <path d="M60,15 L68,15" className="c-arrow" />}
            </g>
          ))}
          <text x="170" y="64" textAnchor="middle" className="c-small">the level cap limits how many points exist</text>
        </svg>
      )
    case 'tree':
      return (
        <svg viewBox="0 0 260 130" className="concept-svg" role="img" aria-label="Skills in tiers with arrows from prerequisites">
          {[
            [20, 10, 'Tier 1'],
            [140, 10, 'Tier 1'],
            [20, 55, 'Tier 2'],
            [140, 55, 'Tier 2'],
            [80, 100, 'Tier 3'],
          ].map(([x, y, t], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <rect width="100" height="24" rx="5" className="c-box" />
              <text x="50" y="16" textAnchor="middle" className="c-small">{t} · cost {Math.floor(Number(y) / 45) + 1}</text>
            </g>
          ))}
          <path d="M70,34 L70,55" className="c-arrow" />
          <path d="M190,34 L190,55" className="c-arrow" />
          <path d="M70,79 L120,100" className="c-arrow" />
          <path d="M190,79 L140,100" className="c-arrow" />
        </svg>
      )
    case 'value':
      return (
        <svg viewBox="0 0 330 70" className="concept-svg" role="img" aria-label="Base value times the rarity and quality multiplier gives the final value">
          {[
            ['Base value', 'c-box'],
            ['× rarity', 'c-box'],
            ['× quality', 'c-box'],
            ['= final value', 'c-accent'],
          ].map(([t, cls], i) => (
            <g key={t} transform={`translate(${i * 80 + 5},18)`}>
              <rect width="72" height="30" rx="5" className={cls} />
              <text x="36" y="19" textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          <text x="165" y="64" textAnchor="middle" className="c-small">rarity and quality pick one cell of the multiplier matrix</text>
        </svg>
      )
    case 'craftChain':
      return (
        <svg viewBox="0 0 330 110" className="concept-svg" role="img" aria-label="Raw resources become intermediate items, which become a product, with quantities on each step">
          <rect x="5" y="10" width="70" height="26" rx="5" className="c-box" />
          <text x="40" y="27" textAnchor="middle" className="c-small">Wood ×4</text>
          <rect x="5" y="70" width="70" height="26" rx="5" className="c-box" />
          <text x="40" y="87" textAnchor="middle" className="c-small">Ore ×2</text>
          <rect x="125" y="10" width="80" height="26" rx="5" className="c-box" />
          <text x="165" y="27" textAnchor="middle" className="c-small">Plank ×4</text>
          <rect x="125" y="70" width="80" height="26" rx="5" className="c-box" />
          <text x="165" y="87" textAnchor="middle" className="c-small">Ingot ×1</text>
          <rect x="250" y="40" width="75" height="26" rx="5" className="c-accent" />
          <text x="287" y="57" textAnchor="middle" className="c-small">Hatchet</text>
          <path d="M75,23 L125,23" className="c-arrow" />
          <path d="M75,83 L125,83" className="c-arrow" />
          <path d="M205,23 L250,50" className="c-arrow" />
          <path d="M205,83 L250,57" className="c-arrow" />
          <text x="100" y="18" textAnchor="middle" className="c-small">2→2</text>
        </svg>
      )
    case 'lootRoll':
      return (
        <svg viewBox="0 0 330 100" className="concept-svg" role="img" aria-label="Weights become a chance per roll; more rolls and more kills raise the chance">
          <rect x="5" y="15" width="180" height="20" className="c-box" />
          <rect x="5" y="15" width="120" height="20" className="c-accent" />
          <rect x="125" y="15" width="50" height="20" fill="#53c28b55" />
          <rect x="175" y="15" width="10" height="20" fill="#f2c94c99" />
          <text x="65" y="29" textAnchor="middle" className="c-small">common 100</text>
          <text x="150" y="29" textAnchor="middle" className="c-small">rare 40</text>
          <text x="5" y="52" className="c-small">chance per roll = weight ÷ total</text>
          <polyline points="200,90 230,70 260,52 290,40 320,34" className="c-line" />
          <line x1="200" y1="90" x2="320" y2="90" className="c-axis" />
          <text x="200" y="20" className="c-small">chance over kills</text>
          <text x="5" y="72" className="c-small">rolls per drop multiply the chances;</text>
          <text x="5" y="86" className="c-small">“kills for 90%” reads off the curve</text>
        </svg>
      )
    case 'typeProfile':
      return (
        <svg viewBox="0 0 330 100" className="concept-svg" role="img" aria-label="The same item form shows different field groups for a weapon, a potion and a wall">
          {[
            ['Weapon', ['Common', 'Combat']],
            ['Potion', ['Common', 'Use']],
            ['Wall', ['Common', 'Build']],
          ].map(([t, groups], i) => (
            <g key={t as string} transform={`translate(${i * 108 + 5},8)`}>
              <text x="48" y="10" textAnchor="middle" className="c-small">{t as string}</text>
              {(groups as string[]).map((g, k) => (
                <g key={g} transform={`translate(0,${18 + k * 30})`}>
                  <rect width="96" height="24" rx="4" className={k === 0 ? 'c-box' : 'c-accent'} />
                  <text x="48" y="16" textAnchor="middle" className="c-small">{g}</text>
                </g>
              ))}
            </g>
          ))}
        </svg>
      )
    case 'damageFlow':
      return (
        <svg viewBox="0 0 330 80" className="concept-svg" role="img" aria-label="Attack is reduced by armor, then by resistance, and may be multiplied by a crit">
          {[
            ['Attack 20', 'c-box'],
            ['− armor', 'c-box'],
            ['− resistance', 'c-box'],
            ['× crit', 'c-box'],
            ['= damage', 'c-accent'],
          ].map(([t, cls], i) => (
            <g key={t} transform={`translate(${i * 65 + 3},16)`}>
              <rect width="58" height="30" rx="5" className={cls} />
              <text x="29" y="19" textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          <text x="165" y="68" textAnchor="middle" className="c-small">negative resistance (a weakness) increases damage</text>
        </svg>
      )
    case 'ttk':
      return (
        <svg viewBox="0 0 330 90" className="concept-svg" role="img" aria-label="Two bars: time for the player to kill the enemy, and time for the enemy to kill the player">
          <text x="5" y="22" className="c-small">player kills in</text>
          <rect x="95" y="10" width="110" height="18" className="c-accent" />
          <text x="210" y="23" className="c-small">hits × interval</text>
          <text x="5" y="55" className="c-small">enemy kills in</text>
          <rect x="95" y="43" width="190" height="18" className="c-danger-band" />
          <text x="5" y="82" className="c-small">longer bottom bar = the player wins with time to spare</text>
        </svg>
      )
    case 'threatRamp':
      return (
        <svg viewBox="0 0 330 110" className="concept-svg" role="img" aria-label="Bars of enemy threat rising across biome stages, with one dip marked">
          {[18, 26, 40, 30, 58, 70, 88].map((h, i) => (
            <rect key={i} x={20 + i * 42} y={95 - h} width="30" height={h} className={i === 3 ? 'c-danger-band' : 'c-accent'} />
          ))}
          <line x1="15" y1="95" x2="320" y2="95" className="c-axis" />
          <text x="20" y="108" className="c-small">Starter</text>
          <text x="280" y="108" className="c-small">Final</text>
          <text x="140" y="14" className="c-small">dip: later but weaker</text>
        </svg>
      )
    case 'phaseBar':
      return (
        <svg viewBox="0 0 330 70" className="concept-svg" role="img" aria-label="A boss HP bar from 100% to 0% split into three phases">
          <rect x="10" y="18" width="120" height="24" fill="#53c28b88" />
          <rect x="130" y="18" width="90" height="24" fill="#4f9cf988" />
          <rect x="220" y="18" width="100" height="24" fill="#f97b4f88" />
          <text x="70" y="34" textAnchor="middle" className="c-small">100–60 %</text>
          <text x="175" y="34" textAnchor="middle" className="c-small">60–30 %</text>
          <text x="270" y="34" textAnchor="middle" className="c-small">30–0 %</text>
          <text x="10" y="60" className="c-small">full HP</text>
          <text x="280" y="60" className="c-small">defeated</text>
        </svg>
      )
    case 'abilityTimeline':
      return (
        <svg viewBox="0 0 320 70" className="concept-svg" role="img" aria-label="Spend cost, cast time, effect, then cooldown">
          <rect x="10" y="20" width="30" height="24" className="c-box" />
          <text x="25" y="36" textAnchor="middle" className="c-small">cost</text>
          <rect x="40" y="20" width="70" height="24" className="c-box" />
          <text x="75" y="36" textAnchor="middle" className="c-small">cast time</text>
          <rect x="110" y="14" width="40" height="36" className="c-accent" />
          <text x="130" y="36" textAnchor="middle" className="c-small">effect</text>
          <rect x="150" y="20" width="160" height="24" className="c-danger-band" />
          <text x="230" y="36" textAnchor="middle" className="c-small">cooldown</text>
          <text x="10" y="64" className="c-small">time →</text>
        </svg>
      )
  }
}

/** Collapsible "How this works" card under a section title. */
export function ConceptCard({ concept, defaultOpen = false }: { concept: GuideConcept; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details className="concept-card" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>ℹ️ {concept.title}</summary>
      <div className="concept-body">
        <Diagram kind={concept.diagram} />
        <p>{concept.body}</p>
      </div>
    </details>
  )
}
