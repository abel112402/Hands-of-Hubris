import type { DeclarativeHintRule, HintCondition } from '../../model/types'
import type { Hint, HintContext, HintRule } from '../types'
import { entitiesOf, entityName, isBlank, isSectionEmpty, sectionsOf, shortList } from '../util'

const compare = (a: unknown, op: string, b: number | string) => {
  const x = typeof b === 'number' ? Number(a) : String(a)
  if (typeof x === 'number' && Number.isNaN(x)) return false
  switch (op) {
    case '<': return x < b
    case '<=': return x <= b
    case '>': return x > b
    case '>=': return x >= b
    case '==': return x === b
    case '!=': return x !== b
    default: return false
  }
}

function matches(ctx: HintContext, rule: DeclarativeHintRule): { names: string[]; first?: string } | null {
  const { project } = ctx
  const sec = sectionsOf(project, rule.doc).find((s) => s.id === rule.section)
  if (!sec) return null
  const c: HintCondition = rule.when
  if (c.kind === 'isEmpty') return isSectionEmpty(sec, project.documents[rule.doc]?.data[rule.section]) ? { names: [] } : null
  const list = entitiesOf(project, rule.doc, rule.section)
  if (c.kind === 'count') return compare(list.length, c.op, c.value) ? { names: [] } : null
  const hit = list.filter((e) =>
    c.kind === 'fieldEmpty' ? isBlank(e[c.field]) : !isBlank(e[c.field]) && compare(e[c.field], c.op, c.value),
  )
  return hit.length ? { names: hit.map(entityName), first: hit[0].id } : null
}

const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))

/** Evaluates the user-defined rules stored in registry.hintRules. */
export const declarativeRule: HintRule = {
  id: 'user.declarative',
  scope: 'section',
  appliesTo: (ctx) => !!ctx.project.registry.hintRules?.length,
  evaluate: (ctx) => {
    const out: Hint[] = []
    for (const rule of ctx.project.registry.hintRules ?? []) {
      if (ctx.docId !== rule.doc) continue
      const m = matches(ctx, rule)
      if (!m) continue
      const vars = { count: m.names.length, names: shortList(m.names) }
      out.push({
        id: `user:${rule.id}`,
        ruleId: `user:${rule.id}`,
        severity: rule.severity,
        scope: 'section',
        target: { docId: rule.doc, sectionId: rule.section, entityId: m.first },
        title: fill(rule.title, vars),
        body: fill(rule.body, vars),
        action: { kind: 'goto', docId: rule.doc, sectionId: rule.section },
      })
    }
    return out
  },
}
