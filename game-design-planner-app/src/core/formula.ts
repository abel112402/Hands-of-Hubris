type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

const tokenize = (src: string): Tok[] => {
  const out: Tok[] = []
  const re = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z_][A-Za-z0-9_.]*)|(.))/gy
  let m: RegExpExecArray | null
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1] !== undefined) out.push({ t: 'num', v: parseFloat(m[1]) })
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] })
    else if (m[3] !== undefined && m[3].trim()) out.push({ t: 'op', v: m[3] })
  }
  return out
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  pow: Math.pow,
  log: Math.log,
}

/** Safe arithmetic evaluator (no eval). Throws on invalid input. */
export function evaluate(expr: string, vars: Record<string, number> = {}): number {
  const toks = tokenize(expr)
  let i = 0
  const peek = () => toks[i]
  const eat = (v?: string) => {
    const t = toks[i++]
    if (!t || (v !== undefined && !(t.t === 'op' && t.v === v))) throw new Error(`Expected ${v ?? 'token'}`)
    return t
  }
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as any).v === v

  function parseExpr(): number {
    let v = parseTerm()
    while (isOp('+') || isOp('-')) v = (eat() as any).v === '+' ? v + parseTerm() : v - parseTerm()
    return v
  }
  function parseTerm(): number {
    let v = parsePow()
    while (isOp('*') || isOp('/')) {
      const op = (eat() as any).v
      const r = parsePow()
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  function parsePow(): number {
    const b = parseUnary()
    if (isOp('^')) {
      eat()
      return Math.pow(b, parsePow())
    }
    return b
  }
  function parseUnary(): number {
    if (isOp('-')) {
      eat()
      return -parseUnary()
    }
    return parseAtom()
  }
  function parseAtom(): number {
    const t = toks[i++]
    if (!t) throw new Error('Unexpected end')
    if (t.t === 'num') return t.v
    if (t.t === 'op' && t.v === '(') {
      const v = parseExpr()
      eat(')')
      return v
    }
    if (t.t === 'id') {
      if (isOp('(')) {
        eat('(')
        const args: number[] = []
        if (!isOp(')')) {
          args.push(parseExpr())
          while (isOp(',')) {
            eat(',')
            args.push(parseExpr())
          }
        }
        eat(')')
        const f = FUNCS[t.v]
        if (!f) throw new Error(`Unknown function ${t.v}`)
        return f(...args)
      }
      if (!(t.v in vars)) throw new Error(`Unknown variable ${t.v}`)
      return vars[t.v]
    }
    throw new Error('Unexpected token')
  }
  const result = parseExpr()
  if (i < toks.length) throw new Error('Unexpected trailing input')
  return result
}

export const tryEvaluate = (expr: string, vars: Record<string, number> = {}) => {
  try {
    const v = evaluate(expr, vars)
    return Number.isFinite(v) ? { ok: true as const, value: v } : { ok: false as const, error: 'Not finite' }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

/** Variable names used in an expression (identifiers that are not function calls). */
export function variablesOf(expr: string): string[] {
  const toks = tokenize(expr)
  const names = new Set<string>()
  toks.forEach((t, idx) => {
    if (t.t === 'id' && !(toks[idx + 1]?.t === 'op' && (toks[idx + 1] as any).v === '(')) names.add(t.v)
  })
  return [...names]
}
