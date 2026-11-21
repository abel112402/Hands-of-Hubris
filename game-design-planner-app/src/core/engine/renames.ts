/**
 * Renamed classes and your own files. The export never overwrites your class files, so when a class of the diagram is
 * renamed (or moves to another module) the old file would stay behind with the old name, and no longer compile against
 * the generated part. Each engine's class index (classes.json) lists, per planner ID, your files and the names inside
 * them (tokens, in the same order every export); comparing the old index in the engine folder with the new one tells
 * which files to move and which names to change in them.
 */

export type ClassIndexEntry = { plannerId: string; own?: string | null; ownFiles?: string[]; tokens?: string[] }
/** Move one of your files: paths from the bundle root; replace = [old, new] names, applied as whole words. */
export type OwnMove = { plannerId: string; from: string; to: string; replace: [string, string][] }

const asEntries = (v: unknown): ClassIndexEntry[] => (Array.isArray(v) ? v.filter((x): x is ClassIndexEntry => !!x && typeof x === 'object' && typeof (x as ClassIndexEntry).plannerId === 'string') : [])

/** Your files and their names, also for an index written before these fields existed (Unity: one file named after the class). */
function filesOf(e: ClassIndexEntry): { files: string[]; tokens: string[] } {
  if (Array.isArray(e.ownFiles)) return { files: e.ownFiles.filter((f) => typeof f === 'string'), tokens: Array.isArray(e.tokens) ? e.tokens.filter((t) => typeof t === 'string') : [] }
  if (typeof e.own === 'string' && e.own.startsWith('Unity/') && e.own.endsWith('.cs')) return { files: [e.own], tokens: [e.own.split('/').pop()!.replace(/\.cs$/, '')] }
  return { files: [], tokens: [] }
}

const safePath = (p: string) => !p.startsWith('/') && !p.split('/').includes('..')

/** The moves that keep your code with its renamed class. Untrusted input (the old index is read from the folder): bad entries are skipped. */
export function ownMoves(oldIndex: unknown, newIndex: unknown): OwnMove[] {
  const before = new Map(asEntries(oldIndex).map((e) => [e.plannerId, filesOf(e)]))
  const moves: OwnMove[] = []
  for (const e of asEntries(newIndex)) {
    const old = before.get(e.plannerId)
    const now = filesOf(e)
    if (!old || old.files.length !== now.files.length || !now.files.length) continue
    const replace = old.tokens.length === now.tokens.length ? old.tokens.map((t, i) => [t, now.tokens[i]] as [string, string]).filter(([a, b]) => a && b && a !== b) : []
    old.files.forEach((from, i) => {
      const to = now.files[i]
      if (from !== to && safePath(from) && safePath(to)) moves.push({ plannerId: e.plannerId, from, to, replace })
    })
  }
  return moves
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The text with every old name changed to the new one, as whole words (EnemyAI is not touched by AI → Brain). */
export function renameIn(text: string, replace: [string, string][]): string {
  // Longest first, so a path or UHealthBase is changed before Health.
  const pairs = [...replace].sort((a, b) => b[0].length - a[0].length)
  if (!pairs.length) return text
  const re = new RegExp(`(?<![A-Za-z0-9_])(${pairs.map(([a]) => escape(a)).join('|')})(?![A-Za-z0-9_])`, 'g')
  const to = new Map(pairs)
  return text.replace(re, (m) => to.get(m) ?? m)
}
