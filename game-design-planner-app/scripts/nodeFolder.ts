import type { Folder, FolderFile } from '../src/core/engine/folder'

/** The few Node file-system calls the CLI uses (the project has no Node type definitions). */
export type NodeFs = {
  existsSync(p: string): boolean
  mkdirSync(p: string, o?: { recursive?: boolean }): void
  readFileSync(p: string, enc: 'utf8'): string
  writeFileSync(p: string, data: string | Uint8Array): void
  readdirSync(p: string): string[]
  statSync(p: string): { isDirectory(): boolean }
  rmSync(p: string, o?: { recursive?: boolean; force?: boolean }): void
}

const join = (a: string, b: string) => `${a.replace(/[\\/]+$/, '')}/${b}`
const notFound = (p: string) => Object.assign(new Error(`Not found: ${p}`), { name: 'NotFoundError' })

/** A folder on disk with the same interface the browser's FileSystemDirectoryHandle gives writeExport. */
export function nodeFolder(fs: NodeFs, dir: string): Folder {
  const name = dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? dir
  const file = (path: string, fileName: string): FolderFile => ({
    kind: 'file',
    name: fileName,
    getFile: async () => ({ text: async () => fs.readFileSync(path, 'utf8') }),
    createWritable: async () => {
      let buf = ''
      return { write: async (d: string) => void (buf += d), close: async () => fs.writeFileSync(path, buf) }
    },
  })
  return {
    kind: 'directory',
    name,
    async getDirectoryHandle(n, o) {
      const p = join(dir, n)
      if (!fs.existsSync(p)) {
        if (!o?.create) throw notFound(p)
        fs.mkdirSync(p, { recursive: true })
      } else if (!fs.statSync(p).isDirectory()) throw Object.assign(new Error(`Not a folder: ${p}`), { name: 'TypeMismatchError' })
      return nodeFolder(fs, p)
    },
    async getFileHandle(n, o) {
      const p = join(dir, n)
      if (!fs.existsSync(p) && !o?.create) throw notFound(p)
      return file(p, n)
    },
    async removeEntry(n) {
      const p = join(dir, n)
      if (!fs.existsSync(p)) throw notFound(p)
      fs.rmSync(p, { recursive: true, force: true })
    },
    async *values() {
      for (const n of fs.readdirSync(dir).sort()) {
        const p = join(dir, n)
        yield fs.statSync(p).isDirectory() ? nodeFolder(fs, p) : file(p, n)
      }
    },
  }
}
