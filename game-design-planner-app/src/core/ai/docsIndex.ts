import { MODULES } from '../modules/registry'
import { moduleToMarkdown } from '../export/markdown'
import type { Project } from '../model/types'

export type DocFile = { path: string; text: string }
export type Chunk = { id: string; source: string; heading: string; text: string; terms: string[] }
export type DocIndex = { chunks: Chunk[]; avgLen: number; df: Map<string, number> }

const MAX_FILES = 300
const MAX_FILE_CHARS = 500_000
const CHUNK_CHARS = 1500

export const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)

/** Docs embedded at build time (lazy chunks, so they are not part of the main bundle). */
const embedded = import.meta.glob('../../../../docs/**/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>

export async function loadEmbeddedDocs(): Promise<DocFile[]> {
  const out: DocFile[] = []
  for (const [path, load] of Object.entries(embedded)) out.push({ path: path.replace(/^.*\/docs\//, 'docs/'), text: await load() })
  return out
}

/** Reads user-selected Markdown files (folder picker). Limits protect against huge or hostile selections. */
export async function readMarkdownFiles(files: File[]): Promise<DocFile[]> {
  const out: DocFile[] = []
  for (const f of files.slice(0, MAX_FILES * 4)) {
    if (out.length >= MAX_FILES) break
    if (!/\.md$/i.test(f.name) || f.size > MAX_FILE_CHARS) continue
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    out.push({ path, text: await f.text() })
  }
  return out
}

export const projectDocs = (project: Project): DocFile[] =>
  MODULES.filter((m) => project.documents[m.id]).map((m) => ({ path: `project/${m.id}`, text: moduleToMarkdown(project, m) }))

function chunkFile(f: DocFile): Chunk[] {
  const out: Chunk[] = []
  let heading = f.path
  let buf = ''
  const flush = () => {
    const text = buf.trim()
    if (text) out.push({ id: `${f.path}#${out.length}`, source: f.path, heading, text, terms: tokenize(`${heading} ${text}`) })
    buf = ''
  }
  for (const line of f.text.split('\n')) {
    const h = /^#{1,4}\s+(.*)/.exec(line)
    if (h || buf.length > CHUNK_CHARS) {
      flush()
      if (h) heading = h[1].trim()
    }
    buf += line + '\n'
  }
  flush()
  return out
}

export function buildIndex(files: DocFile[]): DocIndex {
  const chunks = files.flatMap(chunkFile)
  const df = new Map<string, number>()
  for (const c of chunks) for (const t of new Set(c.terms)) df.set(t, (df.get(t) ?? 0) + 1)
  const avgLen = chunks.reduce((a, c) => a + c.terms.length, 0) / Math.max(chunks.length, 1)
  return { chunks, avgLen, df }
}

/** BM25 keyword search. No embeddings, nothing leaves the browser. */
export function searchIndex(index: DocIndex, query: string, k = 6): (Chunk & { score: number })[] {
  const q = [...new Set(tokenize(query))]
  const N = index.chunks.length
  const k1 = 1.4
  const b = 0.75
  return index.chunks
    .map((c) => {
      const tf = new Map<string, number>()
      for (const t of c.terms) tf.set(t, (tf.get(t) ?? 0) + 1)
      let score = 0
      for (const t of q) {
        const f = tf.get(t)
        if (!f) continue
        const n = index.df.get(t) ?? 0
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.terms.length) / index.avgLen))
      }
      return { ...c, score }
    })
    .filter((c) => c.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k)
}
