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
    case 'pillarTest':
      return (
        <svg viewBox="0 0 330 100" className="concept-svg" role="img" aria-label="Two features tested against a pillar: one serves it and stays, one serves none and is cut">
          <rect x="120" y="36" width="90" height="28" rx="5" className="c-accent" />
          <text x="165" y="54" textAnchor="middle" className="c-small">Pillar</text>
          <rect x="10" y="10" width="90" height="24" rx="5" className="c-box" />
          <text x="55" y="26" textAnchor="middle" className="c-small">Feature A</text>
          <rect x="10" y="66" width="90" height="24" rx="5" className="c-danger-band" />
          <text x="55" y="82" textAnchor="middle" className="c-small">Feature B</text>
          <line x1="100" y1="22" x2="120" y2="46" className="c-line" />
          <text x="226" y="50" className="c-small">A serves it: keep</text>
          <text x="226" y="86" className="c-small">B serves none: cut</text>
        </svg>
      )
    case 'scopeBuckets':
      return (
        <svg viewBox="0 0 330 80" className="concept-svg" role="img" aria-label="Three buckets: In MVP, Later and Out of scope">
          {[
            ['In MVP', 10, 'c-accent'],
            ['Later', 120, 'c-box'],
            ['Out of scope', 230, 'c-danger-band'],
          ].map(([t, x, cls]) => (
            <g key={t as string}>
              <rect x={x as number} y="14" width="90" height="34" rx="5" className={cls as string} />
              <text x={(x as number) + 45} y="35" textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          <text x="10" y="70" className="c-small">every item gets one bucket and at least one pillar</text>
        </svg>
      )
    case 'criticalPath':
      return (
        <svg viewBox="0 0 330 90" className="concept-svg" role="img" aria-label="Three chained phases on the critical path, one side phase with slack, and a buffer after the planned end">
          <rect x="10" y="12" width="70" height="20" rx="4" className="c-accent" />
          <text x="45" y="26" textAnchor="middle" className="c-small">Prep</text>
          <rect x="80" y="12" width="90" height="20" rx="4" className="c-accent" />
          <text x="125" y="26" textAnchor="middle" className="c-small">Prototype</text>
          <rect x="170" y="12" width="90" height="20" rx="4" className="c-accent" />
          <text x="215" y="26" textAnchor="middle" className="c-small">Slice</text>
          <rect x="80" y="42" width="60" height="20" rx="4" className="c-box" />
          <text x="110" y="56" textAnchor="middle" className="c-small">Art</text>
          <line x1="140" y1="52" x2="170" y2="52" className="c-line" strokeDasharray="3 3" />
          <text x="146" y="72" className="c-small">slack</text>
          <rect x="260" y="12" width="40" height="20" rx="4" className="c-danger-band" />
          <text x="280" y="26" textAnchor="middle" className="c-small">+15%</text>
          <text x="10" y="86" className="c-small">highlighted: no slack · last box: buffer</text>
        </svg>
      )
    case 'cutLadder':
      return (
        <svg viewBox="0 0 330 96" className="concept-svg" role="img" aria-label="Three cuts adding up until their total passes the overload line">
          {[
            ['1. Events', 30],
            ['2. Classes', 50],
            ['3. Factions', 70],
          ].map(([t, w], i) => (
            <g key={t as string}>
              <text x="10" y={22 + i * 24} className="c-small">{t}</text>
              <rect x="90" y={10 + i * 24} width={(w as number) * 2.6} height="16" rx="3" className={i === 2 ? 'c-accent' : 'c-box'} />
            </g>
          ))}
          <line x1="250" y1="4" x2="250" y2="80" className="c-line" strokeDasharray="4 3" />
          <text x="214" y="92" className="c-small">overload</text>
        </svg>
      )
    case 'nestedLoops':
      return (
        <svg viewBox="0 0 330 100" className="concept-svg" role="img" aria-label="Three nested rings: many short loops inside a medium loop inside the campaign loop">
          <ellipse cx="130" cy="50" rx="120" ry="44" className="c-box" />
          <ellipse cx="100" cy="50" rx="78" ry="30" className="c-box" />
          <ellipse cx="70" cy="50" rx="36" ry="16" className="c-accent" />
          <text x="70" y="54" textAnchor="middle" className="c-small">gather</text>
          <text x="148" y="54" textAnchor="middle" className="c-small">town</text>
          <text x="226" y="54" textAnchor="middle" className="c-small">campaign</text>
          <text x="262" y="30" className="c-small">×15</text>
          <text x="262" y="46" className="c-small">per day</text>
          <text x="262" y="70" className="c-small">ratio =</text>
          <text x="262" y="84" className="c-small">pacing</text>
        </svg>
      )
    case 'feedbackLoop':
      return (
        <svg viewBox="0 0 330 90" className="concept-svg" role="img" aria-label="Gather feeds craft, craft rewards a better axe, the axe leads back to gather">
          {[
            ['Gather', 10, 'c-box'],
            ['Craft', 120, 'c-box'],
            ['Better axe', 230, 'c-accent'],
          ].map(([t, x, cls]) => (
            <g key={t as string}>
              <rect x={x as number} y="10" width="90" height="26" rx="5" className={cls as string} />
              <text x={(x as number) + 45} y="27" textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          <line x1="100" y1="23" x2="120" y2="23" className="c-line" />
          <line x1="210" y1="23" x2="230" y2="23" className="c-line" />
          <path d="M275 36 V60 H55 V36" fill="none" className="c-line" strokeDasharray="4 3" />
          <text x="110" y="78" className="c-small">feedback: the reward makes the next action better</text>
        </svg>
      )
    case 'tuningTrack':
      return (
        <svg viewBox="0 0 330 92" className="concept-svg" role="img" aria-label="Two tracks from easy on the left to hard on the right; the morale track is drawn flipped because higher is easier there">
          <text x="10" y="12" className="c-small">Enemy HP ×   (higher = harder)</text>
          <rect x="10" y="18" width="300" height="12" rx="6" className="c-box" />
          <line x1="130" y1="14" x2="130" y2="34" className="c-line" />
          {[
            [70, '#53c28b'],
            [130, '#4f9cf9'],
            [230, '#f97b4f'],
          ].map(([x, c]) => <circle key={`a${x}`} cx={x as number} cy="24" r="7" fill={c as string} />)}
          <text x="10" y="54" className="c-small">Morale threshold %   (higher = easier: flipped)</text>
          <rect x="10" y="60" width="300" height="12" rx="6" className="c-box" />
          {[
            [90, '#53c28b'],
            [160, '#4f9cf9'],
            [250, '#f97b4f'],
          ].map(([x, c]) => <circle key={`b${x}`} cx={x as number} cy="66" r="7" fill={c as string} />)}
          <text x="10" y="88" className="c-small">easy</text>
          <text x="285" y="88" className="c-small">hard</text>
        </svg>
      )
    case 'relationWeb':
      return (
        <svg viewBox="0 0 330 110" className="concept-svg" role="img" aria-label="Four factions on a circle: a thick green line between allies, a red line between enemies, a grey neutral line, and two arrows where the directions differ">
          <line x1="60" y1="25" x2="270" y2="25" stroke="rgb(83,194,139)" strokeWidth="5" />
          <line x1="60" y1="25" x2="60" y2="85" stroke="rgb(229,112,126)" strokeWidth="4" />
          <line x1="270" y1="25" x2="270" y2="85" stroke="rgb(139,147,165)" strokeWidth="1.5" />
          <path d="M60,85 Q165,65 245,85" fill="none" stroke="rgb(83,194,139)" strokeWidth="2" />
          <path d="M270,85 Q165,110 85,87" fill="none" stroke="rgb(229,112,126)" strokeWidth="3" />
          {[[60, 25, '#4f9cf9'], [270, 25, '#f2c94c'], [60, 85, '#f97b4f'], [270, 85, '#d86be0']].map(([x, y, c]) => <circle key={`${x}${y}`} cx={x as number} cy={y as number} r="11" fill={c as string} />)}
          <text x="165" y="18" textAnchor="middle" className="c-small">allied</text>
          <text x="20" y="58" className="c-small">hostile</text>
          <text x="278" y="58" className="c-small">neutral</text>
          <text x="165" y="80" textAnchor="middle" className="c-small">one-sided</text>
        </svg>
      )
    case 'unlockWaves':
      return (
        <svg viewBox="0 0 330 96" className="concept-svg" role="img" aria-label="Three columns: a starter biome open at the start, two biomes opened in wave 1 by a boss and a quest in the starter, and a final biome opened in wave 2">
          {[['start', 10], ['wave 1', 120], ['wave 2', 230]].map(([t, x]) => <text key={t} x={Number(x) + 45} y="10" textAnchor="middle" className="c-small">{t}</text>)}
          <rect x="10" y="38" width="90" height="24" rx="5" className="c-box" /><text x="55" y="54" textAnchor="middle" className="c-small">Meadow</text>
          <rect x="120" y="18" width="90" height="24" rx="5" className="c-box" /><text x="165" y="34" textAnchor="middle" className="c-small">Swamp</text>
          <rect x="120" y="62" width="90" height="24" rx="5" className="c-box" /><text x="165" y="78" textAnchor="middle" className="c-small">Hills</text>
          <rect x="230" y="38" width="90" height="24" rx="5" className="c-accent" /><text x="275" y="54" textAnchor="middle" className="c-small">Spire</text>
          <path d="M100 46 C110 46 110 30 120 30" className="c-arrow" /><text x="104" y="26" className="c-small">boss</text>
          <path d="M100 54 C110 54 110 74 120 74" className="c-arrow" /><text x="102" y="92" className="c-small">quest</text>
          <path d="M210 30 C220 30 220 46 230 46" className="c-arrow" />
          <path d="M210 74 C220 74 220 54 230 54" className="c-arrow" />
        </svg>
      )
    case 'atlasLayers':
      return (
        <svg viewBox="0 0 330 96" className="concept-svg" role="img" aria-label="Three map layers stacked: biome zones, then borders and unlock arrows, then capitals and outposts">
          <rect x="10" y="12" width="96" height="70" rx="8" className="c-box" />
          <rect x="18" y="20" width="44" height="54" rx="6" className="c-accent" /><rect x="64" y="20" width="34" height="54" rx="6" className="c-danger-band" />
          <text x="58" y="94" textAnchor="middle" className="c-small">zones</text>
          <rect x="117" y="12" width="96" height="70" rx="8" className="c-box" />
          <line x1="145" y1="47" x2="190" y2="47" className="c-arrow" strokeDasharray="2 4" /><path d="M140 70 Q165 25 195 40" className="c-line" />
          <text x="165" y="94" textAnchor="middle" className="c-small">borders + unlocks</text>
          <rect x="224" y="12" width="96" height="70" rx="8" className="c-box" />
          <text x="250" y="45" className="c-small">★ capital</text><text x="250" y="65" className="c-small">⚑ outpost</text>
          <text x="272" y="94" textAnchor="middle" className="c-small">markers</text>
        </svg>
      )
    case 'repScale':
      return (
        <svg viewBox="0 0 330 74" className="concept-svg" role="img" aria-label="A scale from -100 to 100 split into Hostile, Neutral and Allied, with the start marker at 0 and an action pushing the value across a boundary">
          <rect x="10" y="14" width="100" height="22" fill="rgb(229,112,126)" />
          <rect x="110" y="14" width="110" height="22" fill="rgb(139,147,165)" />
          <rect x="220" y="14" width="100" height="22" fill="rgb(83,194,139)" />
          <text x="60" y="29" textAnchor="middle" className="c-small">Hostile</text>
          <text x="165" y="29" textAnchor="middle" className="c-small">Neutral</text>
          <text x="270" y="29" textAnchor="middle" className="c-small">Allied</text>
          <line x1="165" y1="40" x2="165" y2="50" className="c-line" />
          <text x="165" y="62" textAnchor="middle" className="c-small">start</text>
          <path d="M175 46 Q 205 56 235 44" fill="none" className="c-line" strokeDasharray="3 2" />
          <text x="245" y="62" className="c-small">+ action</text>
          <text x="10" y="10" className="c-small">-100</text>
          <text x="300" y="10" className="c-small">100</text>
        </svg>
      )
    case 'pressureBars':
      return (
        <svg viewBox="0 0 330 84" className="concept-svg" role="img" aria-label="Three stacked bars growing from Easy to Hard, split into combat, survival and economy">
          {[
            ['Easy', [40, 30, 20], '28'],
            ['Medium', [70, 55, 35], '51'],
            ['Hard', [95, 80, 50], '74'],
          ].map(([label, parts, score], i) => {
            let x = 60
            return (
              <g key={label as string}>
                <text x="10" y={20 + i * 24} className="c-small">{label}</text>
                {(parts as number[]).map((w, k) => {
                  const r = <rect key={k} x={x} y={10 + i * 24} width={w} height="14" fill={['#f97b4f', '#53c28b', '#f2c94c'][k]} />
                  x += w
                  return r
                })}
                <text x="300" y={21 + i * 24} className="c-small">{score}</text>
              </g>
            )
          })}
        </svg>
      )
    case 'shareMix':
      return (
        <svg viewBox="0 0 330 70" className="concept-svg" role="img" aria-label="A bar split into Farmer 40%, Builder 30%, Innkeeper 15% and Merchant 15%, adding up to 100%">
          {[
            ['Farmer 40%', 0, 132, '#4f9cf9'],
            ['Builder 30%', 132, 99, '#53c28b'],
            ['Inn 15%', 231, 49.5, '#f2c94c'],
            ['Trade 15%', 280.5, 49.5, '#f97b4f'],
          ].map(([t, x, w, c]) => (
            <g key={t as string}>
              <rect x={x as number} y="14" width={w as number} height="24" fill={c as string} />
              <text x={(x as number) + (w as number) / 2} y="30" textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          <text x="0" y="56" className="c-small">0%</text>
          <text x="305" y="56" className="c-small">100%</text>
          <text x="165" y="56" textAnchor="middle" className="c-small">shares = spawn weights</text>
        </svg>
      )
    case 'needChain':
      return (
        <svg viewBox="0 0 340 70" className="concept-svg" role="img" aria-label="Demand per day, then supply from a resource or building, then a grace period, then the consequence">
          {[
            ['demand / day', 'c-box'],
            ['supply', 'c-box'],
            ['grace days', 'c-danger-band'],
            ['consequence', 'c-accent'],
          ].map(([t, cls], i) => (
            <g key={t} transform={`translate(${i * 84},18)`}>
              <rect width="74" height="30" rx="5" className={cls} />
              <text x="37" y="19" textAnchor="middle" className="c-small">{t}</text>
              {i < 3 && <path d="M74,15 L84,15" className="c-arrow" />}
            </g>
          ))}
          <text x="126" y="64" textAnchor="middle" className="c-small">📦 stock or 🏠 places</text>
        </svg>
      )
    case 'lifespanBands':
      return (
        <svg viewBox="0 0 330 74" className="concept-svg" role="img" aria-label="An age axis from 0 to the maximum age covered by Child, Adult and Elder bands; only Adult is marked as working age">
          <rect x="10" y="12" width="60" height="24" fill="#4f9cf9" /><text x="40" y="28" textAnchor="middle" className="c-small">Child</text>
          <rect x="70" y="12" width="160" height="24" fill="#53c28b" /><text x="150" y="28" textAnchor="middle" className="c-small">Adult</text>
          <rect x="230" y="12" width="90" height="24" fill="#f2c94c" /><text x="275" y="28" textAnchor="middle" className="c-small">Elder</text>
          <rect x="70" y="40" width="160" height="10" className="c-accent" />
          <text x="150" y="64" textAnchor="middle" className="c-small">working age</text>
          <text x="10" y="64" className="c-small">0</text>
          <text x="300" y="64" className="c-small">max</text>
        </svg>
      )
    case 'workforceFlow':
      return (
        <svg viewBox="0 0 340 84" className="concept-svg" role="img" aria-label="Archetype to profession to job to building, with one link to a wrong building shown dashed red">
          {['Archetype', 'Profession', 'Job', 'Building'].map((t, i) => (
            <g key={t} transform={`translate(${i * 86},14)`}>
              <rect width="70" height="24" rx="5" className="c-box" />
              <text x="35" y="16" textAnchor="middle" className="c-small">{t}</text>
              {i < 3 && <path d="M70,12 L86,12" className="c-arrow" />}
            </g>
          ))}
          <rect x="258" y="50" width="70" height="24" rx="5" className="c-box" />
          <text x="293" y="66" textAnchor="middle" className="c-small">Wrong shop</text>
          <path d="M242,26 C252,26 248,62 258,62" fill="none" stroke="rgb(229,112,126)" strokeDasharray="4 3" strokeWidth="2" />
        </svg>
      )
    case 'affinityLadder':
      return (
        <svg viewBox="0 0 330 84" className="concept-svg" role="img" aria-label="An affinity scale with bands from Enemy to Close; Friendship sits on Friend and Marriage on Close">
          {[
            ['Enemy', 10, 70, 'rgb(229,112,126)'],
            ['Neutral', 80, 110, 'rgb(139,147,165)'],
            ['Friend', 190, 70, 'rgb(120,200,150)'],
            ['Close', 260, 60, 'rgb(83,194,139)'],
          ].map(([t, x, w, c]) => (
            <g key={t as string}>
              <rect x={x as number} y="10" width={w as number} height="22" fill={c as string} />
              <text x={(x as number) + (w as number) / 2} y="25" textAnchor="middle" className="c-small">{t}</text>
            </g>
          ))}
          <line x1="198" y1="32" x2="198" y2="48" className="c-line" />
          <rect x="190" y="48" width="66" height="18" rx="9" className="c-box" /><text x="223" y="61" textAnchor="middle" className="c-small">Friendship</text>
          <line x1="268" y1="32" x2="268" y2="48" className="c-line" />
          <rect x="262" y="48" width="62" height="18" rx="9" className="c-accent" /><text x="293" y="61" textAnchor="middle" className="c-small">♥ Marriage</text>
          <text x="10" y="80" className="c-small">−100</text>
          <text x="300" y="80" className="c-small">100</text>
        </svg>
      )
    case 'eventOdds':
      return (
        <svg viewBox="0 0 330 80" className="concept-svg" role="img" aria-label="Bars of events per year: a daily 2% chance about 7 per year, capped at 12 by a 30-day cooldown for a 5% chance, and a seasonal 25% chance once a year">
          {[
            ['2% / day', 7, false],
            ['5% / day, 30d cd', 12, true],
            ['25% / season', 1, false],
          ].map(([t, n, cap], i) => (
            <g key={t as string}>
              <text x="10" y={20 + i * 22} className="c-small">{t}</text>
              <rect x="120" y={10 + i * 22} width={(n as number) * 14} height="14" className={cap ? 'c-danger-band' : 'c-accent'} />
              <text x={126 + (n as number) * 14} y={21 + i * 22} className="c-small">≈ {n as number}/yr{cap ? ' (capped)' : ''}</text>
            </g>
          ))}
        </svg>
      )
    case 'layerRule':
      return (
        <svg viewBox="0 0 330 104" className="concept-svg" role="img" aria-label="Three layers stacked UI, Gameplay, Core; green arrows point down, a red crossed arrow points up from Core to UI">
          {[['UI', 8], ['Gameplay', 40], ['Core', 72]].map(([t, y]) => (
            <g key={t as string}>
              <rect x="10" y={y as number} width="200" height="24" rx="5" className="c-box" />
              <text x="20" y={(y as number) + 16} className="c-small">{t}</text>
            </g>
          ))}
          <path d="M110,32 L110,40" className="c-arrow" />
          <path d="M140,64 L140,72" className="c-arrow" />
          <path d="M185,72 C230,60 230,30 205,22" fill="none" stroke="rgb(229,112,126)" strokeWidth="2" />
          <text x="232" y="50" className="c-small">✗ upward</text>
          <text x="232" y="94" className="c-small">✓ down only</text>
        </svg>
      )
    case 'dsmGrid':
      return (
        <svg viewBox="0 0 330 104" className="concept-svg" role="img" aria-label="A 3 by 3 grid: UI uses Gameplay and Core, Gameplay uses Core, and one red cell where Core uses UI">
          {['UI', 'Game', 'Core'].map((t, i) => (
            <g key={t}>
              <text x={60 + i * 40} y="12" textAnchor="middle" className="c-small">{t}</text>
              <text x="10" y={34 + i * 26} className="c-small">{t}</text>
            </g>
          ))}
          {[0, 1, 2].flatMap((r) =>
            [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={42 + c * 40} y={18 + r * 26} width="36" height="22" className={r === c ? 'c-danger-band' : 'c-box'} opacity={r === c ? 0.3 : 1} />),
          )}
          {[[0, 1], [0, 2], [1, 2]].map(([r, c]) => <text key={`${r}${c}`} x={60 + c * 40} y={34 + r * 26} textAnchor="middle" className="c-small">●</text>)}
          <rect x="42" y="70" width="36" height="22" fill="rgb(229,112,126)" />
          <text x="60" y="86" textAnchor="middle" className="c-small">●</text>
          <text x="180" y="40" className="c-small">row uses column</text>
          <text x="180" y="86" className="c-small">red: Core → UI is upward</text>
        </svg>
      )
    case 'pubSub':
      return (
        <svg viewBox="0 0 330 84" className="concept-svg" role="img" aria-label="Npc publishes NeedChanged on a channel; HUD and Town listen">
          <rect x="10" y="30" width="70" height="24" rx="5" className="c-box" /><text x="45" y="46" textAnchor="middle" className="c-small">Npc</text>
          <rect x="120" y="30" width="96" height="24" rx="12" className="c-accent" /><text x="168" y="46" textAnchor="middle" className="c-small">NeedChanged</text>
          <rect x="250" y="10" width="70" height="24" rx="5" className="c-box" /><text x="285" y="26" textAnchor="middle" className="c-small">HUD</text>
          <rect x="250" y="50" width="70" height="24" rx="5" className="c-box" /><text x="285" y="66" textAnchor="middle" className="c-small">Town</text>
          <path d="M80,42 L120,42" className="c-arrow" />
          <path d="M216,42 L250,22" className="c-arrow" />
          <path d="M216,42 L250,62" className="c-arrow" />
          <text x="100" y="80" className="c-small">publisher and listeners never reference each other</text>
        </svg>
      )
    case 'extensionPlug':
      return (
        <svg viewBox="0 0 330 80" className="concept-svg" role="img" aria-label="New item assets plug into the content registry in Core.Data without code changes">
          {['Sword.asset', 'Bread.asset', 'Mill.asset'].map((t, i) => (
            <g key={t}>
              <rect x="10" y={6 + i * 24} width="80" height="20" rx="4" className="c-box" />
              <text x="50" y={20 + i * 24} textAnchor="middle" className="c-small">{t}</text>
              <path d={`M90,${16 + i * 24} L150,40`} className="c-arrow" />
            </g>
          ))}
          <rect x="150" y="26" width="96" height="28" rx="6" className="c-accent" />
          <text x="198" y="44" textAnchor="middle" className="c-small">registry</text>
          <path d="M246,40 L270,40" className="c-arrow" />
          <text x="274" y="44" className="c-small">game</text>
          <text x="150" y="72" className="c-small">no code change</text>
        </svg>
      )
    case 'tickBudget':
      return (
        <svg viewBox="0 0 330 96" className="concept-svg" role="img" aria-label="Ten tick bars; the first bar is tall because every system runs on it and it crosses the dashed budget line; the others stay under">
          {Array.from({ length: 10 }, (_, i) => {
            const h = i === 0 ? 62 : i % 5 === 0 ? 40 : i % 2 === 0 ? 30 : 18
            return <rect key={i} x={20 + i * 28} y={80 - h} width="20" height={h} className={i === 0 ? 'c-danger-band' : 'c-accent'} />
          })}
          <line x1="14" y1="34" x2="300" y2="34" stroke="rgb(229,112,126)" strokeDasharray="4 3" />
          <text x="230" y="28" className="c-small">budget / frame</text>
          <text x="20" y="94" className="c-small">tick 0: everything at once</text>
        </svg>
      )
    case 'bootChain':
      return (
        <svg viewBox="0 0 340 74" className="concept-svg" role="img" aria-label="Bootstrap, then Persistent, then Main menu, then World with an additive HUD on top">
          {[['Bootstrap', 'c-accent'], ['Persistent', 'c-box'], ['Main menu', 'c-box'], ['World', 'c-box']].map(([t, cls], i) => (
            <g key={t} transform={`translate(${i * 84},30)`}>
              <rect width="72" height="26" rx="5" className={cls} />
              <text x="36" y="17" textAnchor="middle" className="c-small">{t}</text>
              {i < 3 && <path d="M72,13 L84,13" className="c-arrow" />}
            </g>
          ))}
          <rect x="252" y="4" width="72" height="20" rx="5" className="c-box" strokeDasharray="3 2" />
          <text x="288" y="18" textAnchor="middle" className="c-small">+ HUD</text>
        </svg>
      )
    case 'nameAnatomy':
      return (
        <svg viewBox="0 0 330 84" className="concept-svg" role="img" aria-label="The name IDamageable split into prefix I and PascalCase body Damageable; _hunger split into prefix underscore and camelCase body hunger">
          {[['I', 'Damageable', 'prefix', 'PascalCase', 10], ['_', 'hunger', 'prefix', 'camelCase', 170]].map(([pre, body, l1, l2, x]) => (
            <g key={pre as string} transform={`translate(${x},14)`}>
              <rect width="22" height="26" rx="4" className="c-accent" />
              <text x="11" y="18" textAnchor="middle" className="c-small">{pre}</text>
              <rect x="24" width="104" height="26" rx="4" className="c-box" />
              <text x="76" y="18" textAnchor="middle" className="c-small">{body}</text>
              <text x="11" y="56" textAnchor="middle" className="c-small">{l1}</text>
              <text x="76" y="56" textAnchor="middle" className="c-small">{l2}</text>
              <path d="M11,30 L11,44 M76,30 L76,44" className="c-arrow" />
            </g>
          ))}
        </svg>
      )
    case 'folderTree':
      return (
        <svg viewBox="0 0 330 96" className="concept-svg" role="img" aria-label="Scripts folder with Core and UI sub-folders, each holding an asmdef matching an Architecture module">
          <text x="10" y="16" className="c-small">📁 Scripts</text>
          <path d="M18,22 L18,74 M18,44 L34,44 M18,74 L34,74" className="c-arrow" />
          {[['Core', 34], ['UI', 64]].map(([n, y]) => (
            <g key={n as string}>
              <rect x="36" y={(y as number) - 2} width="110" height="20" rx="4" className="c-box" />
              <text x="44" y={(y as number) + 12} className="c-small">📁 {n} + .asmdef</text>
              <path d={`M146,${(y as number) + 8} L196,${(y as number) + 8}`} className="c-arrow" strokeDasharray="3 2" />
              <rect x="198" y={(y as number) - 2} width="110" height="20" rx="4" className="c-accent" />
              <text x="206" y={(y as number) + 12} className="c-small">module {n}</text>
            </g>
          ))}
        </svg>
      )
    case 'mergeConflict':
      return (
        <svg viewBox="0 0 330 90" className="concept-svg" role="img" aria-label="Two people editing one big scene collide; split into additive scenes they edit separately">
          <rect x="10" y="30" width="80" height="30" rx="5" className="c-danger-band" />
          <text x="50" y="49" textAnchor="middle" className="c-small">World.unity</text>
          <text x="20" y="20" className="c-small">👤 art</text>
          <text x="60" y="20" className="c-small">👤 code</text>
          <text x="50" y="78" textAnchor="middle" className="c-small">✗ conflict</text>
          <path d="M100,45 L140,45" className="c-arrow" />
          {[['World_Art', 8], ['World_Light', 36], ['World_Logic', 64]].map(([n, y]) => (
            <g key={n as string}>
              <rect x="150" y={y as number} width="110" height="22" rx="4" className="c-box" />
              <text x="205" y={(y as number) + 15} textAnchor="middle" className="c-small">{n}</text>
            </g>
          ))}
          <text x="266" y="50" className="c-small">✓ one each</text>
        </svg>
      )
    case 'branchLanes':
      return (
        <svg viewBox="0 0 330 90" className="concept-svg" role="img" aria-label="A main lane and a feature lane: the feature branches off main, gets commits, and merges back">
          <text x="6" y="24" className="c-small">main</text>
          <text x="6" y="70" className="c-small">feature</text>
          <path d="M60,20 L320,20" stroke="var(--accent)" strokeWidth="4" />
          <path d="M90,20 C110,20 100,66 130,66 L230,66 C260,66 250,20 280,20" className="c-arrow" />
          {[150, 180, 210].map((x) => <circle key={x} cx={x} cy="66" r="5" className="c-accent" />)}
          <text x="100" y="48" className="c-small">branch</text>
          <text x="248" y="48" className="c-small">merge</text>
        </svg>
      )
    case 'formatFit':
      return (
        <svg viewBox="0 0 330 92" className="concept-svg" role="img" aria-label="Unity Inspector edits ScriptableObject, a spreadsheet edits CSV, a text editor or mod edits JSON">
          {[['Inspector', 'ScriptableObject'], ['Spreadsheet', 'CSV'], ['Mods / tools', 'JSON']].map(([who, fmtName], i) => (
            <g key={fmtName} transform={`translate(${10 + i * 108},10)`}>
              <rect width="96" height="24" rx="5" className="c-box" />
              <text x="48" y="16" textAnchor="middle" className="c-small">{who}</text>
              <path d="M48,24 L48,44" className="c-arrow" />
              <rect y="44" width="96" height="24" rx="5" className="c-accent" />
              <text x="48" y="60" textAnchor="middle" className="c-small">{fmtName}</text>
            </g>
          ))}
        </svg>
      )
    case 'schemaRef':
      return (
        <svg viewBox="0 0 330 96" className="concept-svg" role="img" aria-label="A Recipe box with output of type Item and inputs of type Item list, both pointing at the Item box">
          <rect x="10" y="10" width="130" height="76" rx="6" className="c-box" />
          <text x="20" y="27" className="c-small">Recipe</text>
          <text x="20" y="49" className="c-small">output: Item</text>
          <text x="20" y="69" className="c-small">inputs: Item[]</text>
          <rect x="200" y="22" width="120" height="44" rx="6" className="c-accent" />
          <text x="212" y="40" className="c-small">Item</text>
          <text x="212" y="56" className="c-small">id: item.iron_bar</text>
          <path d="M140,45 C170,45 170,38 200,38" className="c-arrow" />
          <path d="M140,65 C175,65 170,50 200,50" className="c-arrow" strokeWidth="3" />
        </svg>
      )
    case 'idAnatomy':
      return (
        <svg viewBox="0 0 330 74" className="concept-svg" role="img" aria-label="The ID item.iron_sword split into the prefix item. and the snake_case name iron_sword">
          <rect x="30" y="12" width="56" height="28" rx="4" className="c-accent" />
          <text x="58" y="31" textAnchor="middle" className="c-small">item.</text>
          <rect x="88" y="12" width="110" height="28" rx="4" className="c-box" />
          <text x="143" y="31" textAnchor="middle" className="c-small">iron_sword</text>
          <text x="58" y="62" textAnchor="middle" className="c-small">schema prefix</text>
          <text x="143" y="62" textAnchor="middle" className="c-small">snake_case name</text>
          <text x="214" y="31" className="c-small">≠ bld.iron_sword</text>
        </svg>
      )
    case 'loadTimeline':
      return (
        <svg viewBox="0 0 330 84" className="concept-svg" role="img" aria-label="Timeline: small core data at boot, larger town data with the world scene, enemies on demand">
          {[['Boot', 'core 2 MB', 30], ['World scene', 'town 40 MB', 70], ['On demand', 'enemies', 50]].map(([label, what, w], i) => (
            <g key={label as string} transform={`translate(${10 + i * 108},8)`}>
              <text x="0" y="12" className="c-small">{label}</text>
              <rect y="22" width={w as number} height="18" rx="3" className="c-accent" />
              <text x="0" y="58" className="c-small">{what}</text>
              {i < 2 && <path d="M90,31 L104,31" className="c-arrow" />}
            </g>
          ))}
        </svg>
      )
    case 'shiftLeft':
      return (
        <svg viewBox="0 0 330 80" className="concept-svg" role="img" aria-label="Four stages from IDE to analyzer to CI to review; cost grows to the right">
          {['IDE', 'Analyzer', 'CI', 'Review'].map((t, i) => (
            <g key={t} transform={`translate(${10 + i * 80},14)`}>
              <rect width="70" height="26" rx="5" className={i === 3 ? 'c-danger-band' : 'c-accent'} opacity={1 - i * 0.18} />
              <text x="35" y="17" textAnchor="middle" className="c-small">{t}</text>
              {i < 3 && <path d="M70,13 L80,13" className="c-arrow" />}
            </g>
          ))}
          <path d="M14,62 L316,62" className="c-arrow" />
          <text x="14" y="76" className="c-small">cheap, instant</text>
          <text x="316" y="76" textAnchor="end" className="c-small">slow, easy to miss →</text>
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
