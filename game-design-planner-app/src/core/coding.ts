import type { Entity, Project } from './model/types'

/** Coding Standards analysis. Checks the declared rules against each other and the Architecture plan; not a code scan. */
export const CODING_DOC = 'technical.coding'
export const ARCH_DOC = 'technical.architecture'

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const data = (p: Project, doc = CODING_DOC): Record<string, any> => p.documents[doc]?.data ?? {}
const list = (p: Project, section: string, doc = CODING_DOC): Entity[] => {
  const d = data(p, doc)[section]
  return Array.isArray(d) ? d : []
}
export const codingList = (p: Project, section: string) => list(p, section)
export const archModules = (p: Project) => list(p, 'modules', ARCH_DOC)
export const nameOf = (e: Entity | undefined) => (e ? String(e.name || '(unnamed)') : '?')
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ---- Naming rules ----

const CASE_BODY: Record<string, string> = {
  PascalCase: '[A-Z][A-Za-z0-9]*',
  camelCase: '[a-z][A-Za-z0-9]*',
  UPPER_SNAKE: '[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*',
  snake_case: '[a-z][a-z0-9]*(?:_[a-z0-9]+)*',
  'kebab-case': '[a-z][a-z0-9]*(?:-[a-z0-9]+)*',
}
const caseBody = (rule: Entity) => {
  const body = CASE_BODY[str(rule.casing)] ?? '.+'
  // Namespaces and folders may be dotted / nested: every segment follows the casing.
  return rule.target === 'Namespace' && CASE_BODY[str(rule.casing)] ? `${body}(?:\\.${body})*` : body
}

export type NamePattern = { regex: RegExp; source: string; custom: boolean } | { error: string }

/** The regex a rule describes: its custom pattern, or prefix + casing + suffix. */
export function namePattern(rule: Entity): NamePattern {
  const custom = str(rule.pattern)
  if (custom) {
    try {
      return { regex: new RegExp(custom), source: custom, custom: true }
    } catch {
      return { error: 'Invalid pattern' }
    }
  }
  const source = `^${escape(str(rule.prefix))}${caseBody(rule)}${escape(str(rule.suffix))}$`
  return { regex: new RegExp(source), source, custom: false }
}

/** Splits any name into lower-case words: “IDamageable_Variant” → i, damageable, variant. */
export function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)
export function toCasing(ws: string[], casing: string): string {
  switch (casing) {
    case 'PascalCase':
      return ws.map(cap).join('')
    case 'camelCase':
      return ws.map((w, i) => (i ? cap(w) : w)).join('')
    case 'UPPER_SNAKE':
      return ws.map((w) => w.toUpperCase()).join('_')
    case 'snake_case':
      return ws.join('_')
    case 'kebab-case':
      return ws.join('-')
    default:
      return ws.join('')
  }
}

export type NameCheck = { pass: boolean | null; reasons: string[]; fix?: string }

/** Tests a name against one rule, says why it fails, and suggests a fixed name (not for custom patterns). */
export function checkName(rule: Entity, name: string): NameCheck {
  const n = name.trim()
  if (!n) return { pass: null, reasons: [] }
  const pat = namePattern(rule)
  if ('error' in pat) return { pass: null, reasons: [pat.error] }
  const pass = pat.regex.test(n)
  if (pass || pat.custom) return { pass, reasons: pass ? [] : [`does not match ${pat.source}`] }
  const prefix = str(rule.prefix)
  const suffix = str(rule.suffix)
  const reasons: string[] = []
  if (prefix && !n.startsWith(prefix)) reasons.push(`must start with “${prefix}”`)
  if (suffix && !n.endsWith(suffix)) reasons.push(`must end with “${suffix}”`)
  let core = n
  if (prefix && core.startsWith(prefix)) core = core.slice(prefix.length)
  if (suffix && core.endsWith(suffix)) core = core.slice(0, core.length - suffix.length)
  const casing = str(rule.casing)
  if (casing && casing !== 'Any' && !new RegExp(`^${caseBody(rule)}$`).test(core)) reasons.push(`should be ${casing}`)
  if (!reasons.length) reasons.push('does not match')
  // Drop prefix / suffix words before re-casing, so “iDamageable” does not become “IIDamageable”.
  let ws = words(core)
  const pw = words(prefix)
  const sw = words(suffix)
  if (pw.length && ws.slice(0, pw.length).join() === pw.join()) ws = ws.slice(pw.length)
  if (sw.length && ws.slice(-sw.length).join() === sw.join()) ws = ws.slice(0, -sw.length)
  const sep = rule.target === 'Namespace' && n.includes('.')
  const body = sep ? core.split('.').map((seg) => toCasing(words(seg), casing)).join('.') : toCasing(ws, casing)
  const fix = body ? `${prefix}${body}${suffix}` : undefined
  return { pass, reasons, fix: fix && fix !== n && pat.regex.test(fix) ? fix : undefined }
}

export type RuleTest = { rule: Entity; check: NameCheck }
/** Every naming rule (optionally of one target) checked against a name. */
export const testName = (p: Project, name: string, target?: string): RuleTest[] =>
  codingList(p, 'naming')
    .filter((r) => !target || r.target === target)
    .map((rule) => ({ rule, check: checkName(rule, name) }))

export type ExampleIssue = { rule: Entity; problem: 'example' | 'counterExample' | 'pattern' }
/** Rules that contradict themselves: the good example fails, the bad example passes, or the pattern is invalid. */
export function exampleIssues(p: Project): ExampleIssue[] {
  const out: ExampleIssue[] = []
  for (const rule of codingList(p, 'naming')) {
    if ('error' in namePattern(rule)) {
      out.push({ rule, problem: 'pattern' })
      continue
    }
    if (str(rule.example) && checkName(rule, str(rule.example)).pass === false) out.push({ rule, problem: 'example' })
    if (str(rule.counterExample) && checkName(rule, str(rule.counterExample)).pass === true) out.push({ rule, problem: 'counterExample' })
  }
  return out
}

export type NamespaceRow = { module: Entity; assembly: string; check: NameCheck }
/** Technical Architecture assembly names checked against the first Namespace rule. Empty without such a rule. */
export function namespaceCheck(p: Project): { rule?: Entity; rows: NamespaceRow[] } {
  const rule = codingList(p, 'naming').find((r) => r.target === 'Namespace')
  if (!rule) return { rows: [] }
  const rows = archModules(p)
    .filter((m) => str(m.assembly))
    .map((m) => ({ module: m, assembly: str(m.assembly), check: checkName(rule, str(m.assembly)) }))
  return { rule, rows }
}

// ---- Folders ----

export type FolderNode = { folder: Entity; path: string; depth: number; children: FolderNode[] }

/** The folder tree under Assets/. Folders whose parent chain loops or points at a deleted folder are shown as roots and listed. */
export function folderTree(p: Project): { roots: FolderNode[]; flat: FolderNode[]; loops: Entity[]; byId: Map<string, FolderNode> } {
  const folders = codingList(p, 'folders')
  const byFolder = new Map(folders.map((f) => [f.id, f]))
  const loops: Entity[] = []
  const looping = new Set<string>()
  for (const f of folders) {
    const seen = new Set<string>([f.id])
    let cur = byFolder.get(f.parent)
    while (cur) {
      if (seen.has(cur.id)) {
        looping.add(f.id)
        break
      }
      seen.add(cur.id)
      cur = byFolder.get(cur.parent)
    }
  }
  for (const f of folders) if (looping.has(f.id)) loops.push(f)
  const parentOf = (f: Entity) => (looping.has(f.id) || !byFolder.has(f.parent) ? undefined : f.parent)
  const kids = new Map<string | undefined, Entity[]>()
  for (const f of folders) {
    const k = parentOf(f)
    kids.set(k, [...(kids.get(k) ?? []), f])
  }
  const byId = new Map<string, FolderNode>()
  const flat: FolderNode[] = []
  const build = (f: Entity, base: string, depth: number): FolderNode => {
    const node: FolderNode = { folder: f, path: `${base}/${nameOf(f)}`, depth, children: [] }
    byId.set(f.id, node)
    flat.push(node)
    node.children = (kids.get(f.id) ?? []).map((c) => build(c, node.path, depth + 1))
    return node
  }
  const roots = (kids.get(undefined) ?? []).map((f) => build(f, 'Assets', 0))
  return { roots, flat, loops, byId }
}

/** Technical Architecture modules with the folders that hold them; `unplaced` have none. */
export function moduleFolders(p: Project): { rows: { module: Entity; folders: FolderNode[] }[]; unplaced: Entity[] } {
  const tree = folderTree(p)
  const rows = archModules(p).map((module) => ({ module, folders: tree.flat.filter((n) => n.folder.module === module.id) }))
  return { rows, unplaced: rows.filter((r) => !r.folders.length).map((r) => r.module) }
}

/** File types that belong in Git LFS (binary, large, unmergeable). */
export const BINARY_TYPES = ['.psd', '.png', '.jpg', '.jpeg', '.tga', '.tif', '.tiff', '.exr', '.hdr', '.fbx', '.obj', '.blend', '.wav', '.mp3', '.ogg', '.mp4', '.mov', '.ttf', '.otf']
const globToRegex = (g: string) => new RegExp('^' + g.split('*').map(escape).join('.*') + '$', 'i')
const extOf = (t: string) => {
  const m = t.trim().toLowerCase().match(/\.[a-z0-9]+$/)
  return m ? m[0] : ''
}

/** Binary file types the folders say they hold, and whether a Git LFS pattern catches them. */
export function lfsCoverage(p: Project): { ext: string; folders: Entity[]; covered: boolean }[] {
  const patterns = ids(data(p).git?.lfs).map((x) => x.trim()).filter(Boolean)
  const found = new Map<string, Entity[]>()
  for (const f of codingList(p, 'folders'))
    for (const t of ids(f.contents)) {
      const ext = extOf(t)
      if (BINARY_TYPES.includes(ext)) found.set(ext, [...(found.get(ext) ?? []), f])
    }
  return [...found].map(([ext, folders]) => ({ ext, folders, covered: patterns.some((g) => globToRegex(g).test(`file${ext}`)) }))
}

// ---- Git ----

/** “feature/<ticket>-<desc>” → regex: <word> is any text without “/”, * is anything. */
export function branchRegex(pattern: string): RegExp | null {
  const pat = pattern.trim()
  if (!pat) return null
  const src = pat
    .split(/(<[^>]*>|\*)/)
    .map((part) => (part === '*' ? '.*' : /^<[^>]*>$/.test(part) ? '[^/]+' : escape(part)))
    .join('')
  return new RegExp(`^${src}$`)
}

/** Branch types whose pattern (or plain name) matches a branch name. */
export function matchBranch(p: Project, name: string): Entity[] {
  const n = name.trim()
  if (!n) return []
  return codingList(p, 'branches').filter((b) => {
    const re = branchRegex(str(b.pattern))
    return re ? re.test(n) : str(b.name) === n
  })
}

export type BranchIssue = 'noTarget' | 'noSource' | 'missingRef' | 'unprotectedMain'
export type BranchRow = { branch: Entity; from?: Entity; into: Entity[]; issues: BranchIssue[] }

/** Branch types in flow order (permanent first), with where they start and end and what is missing. */
export function branchFlow(p: Project): BranchRow[] {
  const branches = codingList(p, 'branches')
  const byId = new Map(branches.map((b) => [b.id, b]))
  const rank = (b: Entity) => (b.lifetime === 'Permanent' ? 0 : b.lifetime === 'Until release' ? 1 : 2)
  return branches
    .map((b, i) => ({ b, i }))
    .sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i)
    .map(({ b }) => {
      const issues: BranchIssue[] = []
      const permanent = b.lifetime === 'Permanent'
      const into = ids(b.mergesInto).map((id) => byId.get(id)).filter((x): x is Entity => !!x)
      if ((b.from && !byId.has(b.from)) || into.length < ids(b.mergesInto).length) issues.push('missingRef')
      if (!permanent && !into.length) issues.push('noTarget')
      if (!permanent && !b.from) issues.push('noSource')
      if (permanent && !b.protected && into.length === 0) issues.push('unprotectedMain')
      return { branch: b, from: byId.get(b.from), into, issues }
    })
}

const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([\w\-./ ]+\))?!?: \S.*/
const TICKET = /^[A-Z][A-Z0-9]+-\d+\b.*\S/

/** Checks a commit message against the chosen format. null = no format or free format. */
export function checkCommit(format: unknown, message: string): boolean | null {
  const m = message.trim()
  if (!m) return null
  if (format === 'Conventional Commits') return CONVENTIONAL.test(m)
  if (format === 'Ticket prefix') return TICKET.test(m)
  return null
}

// ---- Enforcement ----

export const RULE_SOURCES = [
  { section: 'naming', label: 'Naming' },
  { section: 'assetRules', label: 'Asset rules' },
  { section: 'review', label: 'Review checks' },
] as const
export type RuleRow = { section: string; rule: Entity; enforcement: string; severity: string; automated: boolean }

/** Every rule of the document with how it is enforced. Unset = Manual. */
export function enforcementRows(p: Project): RuleRow[] {
  return RULE_SOURCES.flatMap(({ section }) =>
    codingList(p, section).map((rule) => {
      const enforcement = str(rule.enforcement) || 'Manual'
      return { section, rule, enforcement, severity: str(rule.severity) || 'Minor', automated: enforcement !== 'Manual' }
    }),
  )
}

/** Counts per source (and in total): how many rules a tool catches. */
export function enforcementSummary(p: Project) {
  const rows = enforcementRows(p)
  const count = (rs: RuleRow[]) => ({ total: rs.length, automated: rs.filter((r) => r.automated).length, share: rs.length ? rs.filter((r) => r.automated).length / rs.length : 0 })
  return {
    rows,
    total: count(rows),
    bySource: RULE_SOURCES.map((s) => ({ ...s, ...count(rows.filter((r) => r.section === s.section)) })),
    manualBlockers: rows.filter((r) => !r.automated && r.severity === 'Blocker'),
  }
}
