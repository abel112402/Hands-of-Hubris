import { FUNCS, tokenize, type Tok } from '../formula'

/** A formula as a tree, so engine adapters can write it in their own language. Same grammar as `evaluate` in core/formula. */
export type FormulaNode =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: FormulaNode }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: FormulaNode; b: FormulaNode }
  | { k: 'call'; fn: string; args: FormulaNode[] }

/** Parses an expression into a tree. Throws on invalid input or an unknown function, like `evaluate`. */
export function parseFormula(expr: string): FormulaNode {
  const toks = tokenize(expr)
  let i = 0
  const isOp = (v: string) => {
    const t: Tok | undefined = toks[i]
    return t?.t === 'op' && t.v === v
  }
  const eat = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected ${v}`)
    i++
  }
  function expr0(): FormulaNode {
    let a = term()
    while (isOp('+') || isOp('-')) {
      const op = (toks[i++] as { v: '+' | '-' }).v
      a = { k: 'bin', op, a, b: term() }
    }
    return a
  }
  function term(): FormulaNode {
    let a = pow()
    while (isOp('*') || isOp('/')) {
      const op = (toks[i++] as { v: '*' | '/' }).v
      a = { k: 'bin', op, a, b: pow() }
    }
    return a
  }
  function pow(): FormulaNode {
    const a = unary()
    if (isOp('^')) {
      i++
      return { k: 'bin', op: '^', a, b: pow() }
    }
    return a
  }
  function unary(): FormulaNode {
    if (isOp('-')) {
      i++
      return { k: 'neg', a: unary() }
    }
    return atom()
  }
  function atom(): FormulaNode {
    const t = toks[i++]
    if (!t) throw new Error('Unexpected end')
    if (t.t === 'num') return { k: 'num', v: t.v }
    if (t.t === 'op' && t.v === '(') {
      const v = expr0()
      eat(')')
      return v
    }
    if (t.t === 'id') {
      if (!isOp('(')) return { k: 'var', name: t.v }
      i++
      const args: FormulaNode[] = []
      if (!isOp(')')) {
        args.push(expr0())
        while (isOp(',')) {
          i++
          args.push(expr0())
        }
      }
      eat(')')
      if (!FUNCS[t.v]) throw new Error(`Unknown function ${t.v}`)
      return { k: 'call', fn: t.v, args }
    }
    throw new Error('Unexpected token')
  }
  const out = expr0()
  if (i < toks.length) throw new Error('Unexpected trailing input')
  return out
}

/** Evaluates a tree; used by tests to prove the tree means the same as the expression. */
export function evalFormula(n: FormulaNode, vars: Record<string, number>): number {
  switch (n.k) {
    case 'num':
      return n.v
    case 'var':
      if (!(n.name in vars)) throw new Error(`Unknown variable ${n.name}`)
      return vars[n.name]
    case 'neg':
      return -evalFormula(n.a, vars)
    case 'call':
      return FUNCS[n.fn](...n.args.map((a) => evalFormula(a, vars)))
    case 'bin': {
      const a = evalFormula(n.a, vars)
      const b = evalFormula(n.b, vars)
      return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : Math.pow(a, b)
    }
  }
}

/** Variable names in tree order, each once. */
export function formulaVars(n: FormulaNode, out: string[] = []): string[] {
  if (n.k === 'var' && !out.includes(n.name)) out.push(n.name)
  if (n.k === 'neg') formulaVars(n.a, out)
  if (n.k === 'bin') formulaVars(n.b, formulaVars(n.a, out))
  if (n.k === 'call') n.args.forEach((a) => formulaVars(a, out))
  return out
}
