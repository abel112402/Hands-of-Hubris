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
    case 'dayClock':
      return (
        <svg viewBox="0 0 330 120" className="concept-svg" role="img" aria-label="A 24-hour dial with midnight at the top and phases as arcs, night crossing midnight">
          <circle cx="60" cy="60" r="45" fill="none" stroke="#5ad1d188" strokeWidth="18" />
          <path d="M60,15 A45,45 0 0 1 99,82" fill="none" stroke="#4f5b9c" strokeWidth="18" transform="rotate(-80 60 60)" />
          <text x="60" y="10" textAnchor="middle" className="c-small">00</text>
          <text x="60" y="118" textAnchor="middle" className="c-small">12</text>
          <text x="60" y="64" textAnchor="middle" className="c-small">24 h</text>
          <text x="125" y="40" className="c-small">midnight at the top, clockwise</text>
          <text x="125" y="58" className="c-small">night arc crosses midnight</text>
          <text x="125" y="76" className="c-small">every hour in exactly one phase</text>
        </svg>
      )
    case 'modifierStack':
      return (
        <svg viewBox="0 0 330 70" className="concept-svg" role="img" aria-label="Night times storm times Blood moon gives the combined multiplier">
          {[
            ['Night ×1.3', 'c-box'],
            ['Storm ×1.2', 'c-box'],
            ['Blood moon ×1.5', 'c-box'],
            ['= ×2.34', 'c-accent'],
          ].map(([t, cls], i) => (
            <g key={t} transform={`translate(${i * 80 + 5},16)`}>
              <rect width="74" height="30" rx="5" className={cls} />
              <text x="37" y="19" textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          <text x="165" y="64" textAnchor="middle" className="c-small">multipliers multiply; the lowest visibility wins</text>
        </svg>
      )
    case 'weatherMix':
      return (
        <svg viewBox="0 0 330 70" className="concept-svg" role="img" aria-label="A biome bar split into rain, fog, storm and the clear remainder">
          <rect x="10" y="18" width="78" height="24" fill="#4f9cf999" />
          <rect x="88" y="18" width="31" height="24" fill="#8b93a599" />
          <rect x="119" y="18" width="25" height="24" fill="#d86be099" />
          <rect x="144" y="18" width="176" height="24" className="c-box" />
          <text x="49" y="34" textAnchor="middle" className="c-small">rain 25%</text>
          <text x="232" y="34" textAnchor="middle" className="c-small">clear: the rest (57%)</text>
          <text x="10" y="62" className="c-small">fog 10% · storm 8% — shares add up, the rest is clear</text>
        </svg>
      )
    case 'eventCalendar':
      return (
        <svg viewBox="0 0 330 90" className="concept-svg" role="img" aria-label="A year with seasons, repeating event ticks and one coincidence">
          <rect x="10" y="10" width="78" height="14" fill="#53c28b88" />
          <rect x="88" y="10" width="78" height="14" fill="#f2c94c88" />
          <rect x="166" y="10" width="78" height="14" fill="#f97b4f88" />
          <rect x="244" y="10" width="78" height="14" fill="#5ad1d188" />
          {[36, 62, 88, 114, 140, 166, 192, 218, 244, 270, 296].map((x) => <rect key={x} x={x} y="34" width="3" height="12" className="c-accent" />)}
          {[88, 166, 244].map((x) => <rect key={x} x={x} y="52" width="3" height="12" fill="#e5586b" />)}
          <circle cx="167" cy="52" r="12" fill="none" stroke="#e5586b" />
          <text x="10" y="84" className="c-small">full moon every cycle · blood moon every 3rd · circled: they coincide</text>
        </svg>
      )
    case 'priceChain':
      return (
        <svg viewBox="0 0 330 70" className="concept-svg" role="img" aria-label="Value times margin, markup, relationship, difficulty and rules gives the price">
          {[
            ['value', 'c-box'],
            ['× margin', 'c-box'],
            ['× markup', 'c-box'],
            ['× rep', 'c-box'],
            ['× diff.', 'c-box'],
            ['= price', 'c-accent'],
          ].map(([t, cls], i) => (
            <g key={t} transform={`translate(${i * 54 + 4},16)`}>
              <rect width="50" height="28" rx="5" className={cls} />
              <text x="25" y="18" textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          <text x="165" y="62" textAnchor="middle" className="c-small">then any matching price rules; selling divides rep and difficulty</text>
        </svg>
      )
    case 'spread':
      return (
        <svg viewBox="0 0 330 90" className="concept-svg" role="img" aria-label="Buy price above sell price is a spread; when they cross it is a loop">
          <line x1="20" y1="20" x2="140" y2="20" className="c-line" />
          <line x1="20" y1="54" x2="140" y2="54" className="c-line" />
          <rect x="60" y="20" width="40" height="34" className="c-box" />
          <text x="80" y="41" textAnchor="middle" className="c-small">spread</text>
          <text x="20" y="14" className="c-small">player buys</text>
          <text x="20" y="68" className="c-small">player sells</text>
          <line x1="190" y1="54" x2="310" y2="54" className="c-line" />
          <line x1="190" y1="22" x2="310" y2="22" stroke="#e5586b" />
          <rect x="230" y="22" width="40" height="32" className="c-danger-band" />
          <text x="190" y="16" className="c-small">sells for more elsewhere</text>
          <text x="190" y="68" className="c-small">buys here</text>
          <text x="165" y="86" textAnchor="middle" className="c-small">left: healthy · right: a money loop</text>
        </svg>
      )
    case 'wanderOdds':
      return (
        <svg viewBox="0 0 330 70" className="concept-svg" role="img" aria-label="A roll every N days, some of which become visits">
          <rect x="10" y="20" width="310" height="16" className="c-box" />
          {[1, 2, 3, 4, 5, 6].map((i) => <line key={i} x1={10 + i * 51} x2={10 + i * 51} y1="14" y2="42" className="c-line" />)}
          {[1, 3, 4].map((i) => <rect key={i} x={10 + i * 51} y="20" width="14" height="16" className="c-accent" />)}
          <text x="10" y="58" className="c-small">ticks: a roll every N days · blocks: the rolls that came up</text>
        </svg>
      )
    case 'sourceSink':
      return (
        <svg viewBox="0 0 330 80" className="concept-svg" role="img" aria-label="Sources fill the wallet, sinks drain it">
          {['loot', 'quests', 'wages'].map((t, i) => (
            <g key={t}>
              <line x1="70" y1={i * 22 + 15} x2="130" y2="37" className="c-line" />
              <rect x="10" y={i * 22 + 6} width="60" height="18" rx="4" className="c-box" />
              <text x="40" y={i * 22 + 19} textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          {['repairs', 'upkeep', 'buying'].map((t, i) => (
            <g key={t}>
              <line x1="200" y1="37" x2="260" y2={i * 22 + 15} className="c-line" />
              <rect x="260" y={i * 22 + 6} width="60" height="18" rx="4" className="c-danger-band" />
              <text x="290" y={i * 22 + 19} textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          <rect x="130" y="22" width="70" height="30" rx="6" className="c-accent" />
          <text x="165" y="41" textAnchor="middle" className="c-small">wallet</text>
        </svg>
      )
    case 'actPacing':
      return (
        <svg viewBox="0 0 330 90" className="concept-svg" role="img" aria-label="Act length bars with quest time inside, and a level band each act should land in">
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${10 + i * 105},10)`}>
              <rect width="95" height="18" className="c-box" />
              <rect width={[70, 85, 40][i]} height="18" className="c-accent" />
              <rect y="34" width="95" height="14" className="c-danger-band" opacity="0.4" />
              <circle cx={[60, 50, 88][i]} cy="41" r="4" fill={i === 2 ? '#e5586b' : '#f2c94c'} />
            </g>
          ))}
          <text x="10" y="76" className="c-small">bar: quest time inside the act · dot: level at the end vs. the intended band</text>
        </svg>
      )
    case 'questChain':
      return (
        <svg viewBox="0 0 330 80" className="concept-svg" role="img" aria-label="Quests linked by requirements, with a loop marked">
          {['Start', 'Lighthouse', 'Fog', 'Secret'].map((t, i) => (
            <g key={t}>
              {i > 0 && <line x1={10 + i * 80 - 12} y1="27" x2={10 + i * 80} y2="27" className="c-line" />}
              <rect x={10 + i * 80} y="14" width="68" height="26" rx="5" className={i < 4 ? 'c-accent' : 'c-box'} />
              <text x={44 + i * 80} y="31" textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          <text x="10" y="64" className="c-small">each arrow is “requires”; the longest main chain is the questline</text>
        </svg>
      )
    case 'choiceBranch':
      return (
        <svg viewBox="0 0 330 90" className="concept-svg" role="img" aria-label="One decision with two options, each leading to its own ending">
          <polygon points="50,40 80,20 110,40 80,60" className="c-box" />
          <text x="80" y="44" textAnchor="middle" className="c-small">decision</text>
          <line x1="110" y1="40" x2="150" y2="20" className="c-line" />
          <line x1="110" y1="40" x2="150" y2="62" className="c-line" />
          <rect x="150" y="8" width="70" height="24" rx="5" className="c-accent" />
          <text x="185" y="24" textAnchor="middle" className="c-small">option A</text>
          <rect x="150" y="50" width="70" height="24" rx="5" className="c-accent" />
          <text x="185" y="66" textAnchor="middle" className="c-small">option B</text>
          <line x1="220" y1="20" x2="245" y2="20" className="c-line" />
          <line x1="220" y1="62" x2="245" y2="62" className="c-line" />
          <rect x="245" y="8" width="75" height="24" rx="12" className="c-box" />
          <text x="282" y="24" textAnchor="middle" className="c-small">ending A</text>
          <rect x="245" y="50" width="75" height="24" rx="12" className="c-box" />
          <text x="282" y="66" textAnchor="middle" className="c-small">ending B</text>
          <text x="10" y="86" className="c-small">picking A closes B’s path</text>
        </svg>
      )
    case 'rewardBudget':
      return (
        <svg viewBox="0 0 330 90" className="concept-svg" role="img" aria-label="XP, money and reputation stacked per act">
          {[[20, 14, 8], [34, 20, 14], [46, 28, 20]].map((h, i) => {
            let y = 64
            return (
              <g key={i}>
                {h.map((v, j) => {
                  y -= v
                  return <rect key={j} x={30 + i * 90} y={y} width="40" height={v} fill={['#f2c94c99', '#53c28b99', '#d86be099'][j]} />
                })}
                <text x={50 + i * 90} y="78" textAnchor="middle" className="c-small">act {i + 1}</text>
              </g>
            )
          })}
          <text x="200" y="14" className="c-small">XP · money · reputation</text>
        </svg>
      )
    case 'wireAnatomy':
      return (
        <svg viewBox="0 0 330 110" className="concept-svg" role="img" aria-label="A screen with its dashed safe area, a grid, an element inside and a too-small button flagged">
          <rect x="10" y="8" width="200" height="94" className="c-box" />
          {[30, 50, 70, 90, 110, 130, 150, 170, 190].map((x) => <line key={x} x1={x} y1="8" x2={x} y2="102" className="c-axis" opacity="0.25" />)}
          <rect x="20" y="16" width="180" height="78" fill="none" stroke="#5b9cff" strokeDasharray="4 3" />
          <rect x="28" y="70" width="70" height="16" rx="8" className="c-accent" />
          <rect x="160" y="22" width="12" height="8" rx="2" fill="none" stroke="#e5b455" strokeWidth="2" />
          <text x="176" y="20" className="c-small" fill="#e5b455">⚑</text>
          <text x="220" y="24" className="c-small">dashed: safe area</text>
          <text x="220" y="44" className="c-small">grid: snapping</text>
          <text x="220" y="64" className="c-small">⚑: below the</text>
          <text x="220" y="78" className="c-small">minimum size</text>
        </svg>
      )
    case 'screenDepth':
      return (
        <svg viewBox="0 0 330 90" className="concept-svg" role="img" aria-label="Screens one and two clicks from the HUD, one with no way back">
          {[
            ['HUD', 10, 34, 'c-accent'],
            ['Inventory', 120, 10, 'c-box'],
            ['Pause', 120, 56, 'c-box'],
            ['Settings', 230, 56, 'c-danger-band'],
          ].map(([t, x, y, cls]) => (
            <g key={t as string}>
              <rect x={x as number} y={y as number} width="86" height="24" rx="5" className={cls as string} />
              <text x={(x as number) + 43} y={(y as number) + 16} textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          <line x1="96" y1="46" x2="120" y2="22" className="c-line" />
          <line x1="96" y1="46" x2="120" y2="68" className="c-line" />
          <line x1="206" y1="68" x2="230" y2="68" className="c-line" />
          <text x="10" y="88" className="c-small">columns = clicks · red: no way back</text>
        </svg>
      )
    case 'hudBinding':
      return (
        <svg viewBox="0 0 330 70" className="concept-svg" role="img" aria-label="A stat bar on the HUD linked to the Health survival stat">
          <rect x="10" y="20" width="130" height="22" rx="11" className="c-box" />
          <rect x="10" y="20" width="90" height="22" rx="11" className="c-accent" />
          <text x="20" y="35" className="c-small">Health</text>
          <line x1="140" y1="31" x2="200" y2="31" className="c-line" strokeDasharray="4 3" />
          <rect x="200" y="14" width="120" height="34" rx="5" className="c-box" />
          <text x="260" y="29" textAnchor="middle" className="c-small">Player › survival</text>
          <text x="260" y="42" textAnchor="middle" className="c-small">Health, max 100</text>
          <text x="10" y="64" className="c-small">the widget shows a live entry of the game data</text>
        </svg>
      )
    case 'keyConflict':
      return (
        <svg viewBox="0 0 330 80" className="concept-svg" role="img" aria-label="E bound to two actions in gameplay is a conflict; Esc in two contexts is fine">
          <rect x="10" y="10" width="34" height="30" rx="5" fill="#e5586b55" stroke="#e5586b" />
          <text x="27" y="30" textAnchor="middle" className="c-small">E</text>
          <text x="54" y="22" className="c-small">Interact · gameplay</text>
          <text x="54" y="36" className="c-small">Inventory · gameplay  → clash</text>
          <rect x="10" y="46" width="34" height="30" rx="5" className="c-box" />
          <text x="27" y="66" textAnchor="middle" className="c-small">Esc</text>
          <text x="54" y="58" className="c-small">Pause · gameplay</text>
          <text x="54" y="72" className="c-small">Close · Inventory  → fine</text>
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
