/**
 * Stylised picture of the workspace for the landing page: planners · current step + journey · progress.
 * Drawn inline (no image request, CSP-safe) in the app's own palette; it is a sketch, not a screenshot.
 */
const C = {
  bg: '#111316', s1: '#171a1f', s2: '#1e2229', s3: '#262b34', line: '#30353f', text: '#e6e8ee', muted: '#8b93a5',
  brand: '#f2a541', ok: '#4cc38a', concept: '#b08cff', systems: '#5b9cff', content: '#3fc6a5', production: '#f2a541', polish: '#ff7a8a',
}
const PHASES = [C.concept, C.systems, C.content, C.production, C.polish]

const Bar = ({ x, y, w, h = 6, fill = C.s3, r = 3 }: { x: number; y: number; w: number; h?: number; fill?: string; r?: number }) => <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} />

export function WorkspaceIllustration({ label }: { label: string }) {
  const rail = [70, 52, 64, 58, 76, 48, 66, 60, 54, 72]
  const steps = [
    { done: true, w: 120 },
    { done: true, w: 150 },
    { current: true, w: 132 },
    { w: 160 },
    { w: 110 },
    { w: 140 },
  ]
  return (
    <svg className="landing-shot-svg" viewBox="0 0 960 440" role="img" aria-label={label}>
      <rect width="960" height="440" rx="14" fill={C.bg} stroke={C.line} />
      {/* top bar */}
      <rect x="0.5" y="0.5" width="959" height="40" rx="14" fill={C.s1} />
      <rect x="0" y="26" width="960" height="15" fill={C.s1} />
      <line x1="0" y1="41" x2="960" y2="41" stroke={C.line} />
      <path d="M26 12 34 16.5v9L26 30l-8-4.5v-9Z" fill={C.brand} />
      <Bar x={44} y={18} w={96} fill={C.s3} />
      <rect x="868" y="12" width="64" height="18" rx="5" fill={C.systems} opacity=".85" />

      {/* rail */}
      <rect x="0" y="41" width="200" height="399" fill={C.s1} />
      <line x1="200" y1="41" x2="200" y2="440" stroke={C.line} />
      <rect x="16" y="58" width="168" height="22" rx="5" fill={C.s2} stroke={C.line} />
      {rail.map((w, i) => (
        <g key={i} transform={`translate(0 ${98 + i * 32})`}>
          {i === 1 && <rect x="8" y="-8" width="184" height="26" rx="5" fill={C.s2} />}
          <rect x="20" y="-1" width="12" height="12" rx="3" fill="none" stroke={C.muted} strokeWidth="1.5" />
          <Bar x={42} y={2} w={w} fill={i === 1 ? C.text : C.s3} />
          {i === 1 && <circle cx="160" cy="5" r="4" fill={C.brand} />}
          <circle cx="176" cy="5" r="5.5" fill="none" stroke={C.line} strokeWidth="1.5" />
          {i % 3 === 0 && <path d="M176 5V-.5A5.5 5.5 0 0 1 181.2 6.8Z" fill={C.ok} />}
        </g>
      ))}

      {/* center */}
      <Bar x={240} y={62} w={120} h={6} fill={C.s3} />
      <Bar x={240} y={76} w={220} h={14} r={4} fill={C.text} />
      <rect x="240" y="100" width="70" height="16" rx="8" fill={C.s2} stroke={C.line} />
      {/* tabs */}
      <line x1="240" y1="140" x2="720" y2="140" stroke={C.line} />
      <Bar x={248} y={126} w={70} fill={C.text} />
      <rect x="240" y="138" width="88" height="2" fill={C.text} />
      <Bar x={344} y={126} w={40} fill={C.s3} />
      <Bar x={400} y={126} w={24} fill={C.s3} />
      {/* hero card */}
      <rect x="240" y="154" width="480" height="132" rx="10" fill={C.s1} stroke={C.line} />
      <rect x="240" y="154" width="4" height="132" fill={C.concept} />
      <circle cx="262" cy="174" r="4" fill={C.brand} />
      <Bar x={272} y={171} w={130} fill={C.s3} />
      <Bar x={258} y={188} w={180} h={14} r={4} fill={C.text} />
      <Bar x={258} y={214} w={420} fill={C.s3} />
      <Bar x={258} y={226} w={360} fill={C.s3} />
      <rect x="258" y="248" width="92" height="24" rx="6" fill={C.brand} />
      <Bar x={272} y={257} w={64} fill="#111316" />
      <Bar x={364} y={257} w={48} fill={C.muted} />
      <Bar x={426} y={257} w={56} fill={C.muted} />
      {/* journey */}
      <circle cx="248" cy="310" r="6" fill="none" stroke={C.concept} strokeWidth="2" />
      <path d="M248 304a6 6 0 0 1 0 12Z" fill={C.concept} />
      <Bar x={262} y={306} w={70} h={8} fill={C.text} />
      <line x1="257" y1="330" x2="257" y2="430" stroke={C.concept} strokeOpacity=".4" strokeWidth="2" />
      {steps.map((s, i) => (
        <g key={i} transform={`translate(0 ${334 + i * 18})`}>
          {s.current && <rect x="244" y="-7" width="476" height="16" rx="4" fill={C.brand} opacity=".08" />}
          <circle cx="257" cy="1" r="5.5" fill={s.done ? C.concept : C.bg} stroke={s.current ? C.brand : s.done ? C.concept : C.line} strokeWidth="2" />
          <Bar x={274} y={-2} w={s.w} fill={s.done ? C.s3 : C.muted} />
        </g>
      ))}

      {/* progress */}
      <rect x="760" y="41" width="200" height="399" fill={C.s1} />
      <line x1="760" y1="41" x2="760" y2="440" stroke={C.line} />
      <Bar x={780} y={62} w={110} h={8} fill={C.text} />
      <circle cx="810" cy="112" r="24" fill="none" stroke={C.s3} strokeWidth="7" />
      <circle cx="810" cy="112" r="24" fill="none" stroke={C.ok} strokeWidth="7" strokeLinecap="round" strokeDasharray="34 151" transform="rotate(-90 810 112)" />
      <Bar x={846} y={102} w={80} fill={C.text} />
      <Bar x={846} y={116} w={60} fill={C.s3} />
      {PHASES.map((c, i) => (
        <g key={c} transform={`translate(0 ${170 + i * 26})`}>
          <circle cx="786" cy="0" r="6" fill={i === 0 ? c : 'none'} stroke={c} strokeWidth="2" opacity={i === 0 ? 1 : 0.9} />
          <Bar x={800} y={-3} w={70 - i * 4} fill={i === 0 ? C.text : C.muted} />
          <Bar x={916} y={-3} w={22} fill={C.s3} />
        </g>
      ))}
      {[0.4, 0.13, 0.05, 0.3].map((p, i) => (
        <g key={i} transform={`translate(0 ${314 + i * 22})`}>
          <Bar x={780} y={-3} w={60} fill={C.s3} />
          <Bar x={852} y={-2} w={70} h={5} fill={C.s3} />
          <Bar x={852} y={-2} w={70 * p} h={5} fill={C.ok} />
        </g>
      ))}
    </svg>
  )
}
