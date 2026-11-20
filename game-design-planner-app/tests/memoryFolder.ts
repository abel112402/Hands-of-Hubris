import type { Folder, FolderFile } from '../src/core/engine/folder'

/** An in-memory stand-in for a FileSystemDirectoryHandle, with a log of writes and removals (in order). */
export class MemoryFolder implements Folder {
  kind = 'directory' as const
  dirs = new Map<string, MemoryFolder>()
  files = new Map<string, string>()
  constructor(
    public name: string,
    public log: string[] = [],
    private path = '',
  ) {}

  async getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<Folder> {
    if (this.files.has(name)) throw Object.assign(new Error('file'), { name: 'TypeMismatchError' })
    if (!this.dirs.has(name)) {
      if (!o?.create) throw Object.assign(new Error(`no ${name}`), { name: 'NotFoundError' })
      this.dirs.set(name, new MemoryFolder(name, this.log, `${this.path}${name}/`))
    }
    return this.dirs.get(name)!
  }

  async getFileHandle(name: string, o?: { create?: boolean }): Promise<FolderFile> {
    if (!this.files.has(name) && !o?.create) throw Object.assign(new Error(`no ${name}`), { name: 'NotFoundError' })
    const files = this.files
    const log = this.log
    const where = this.path
    return {
      kind: 'file',
      name,
      getFile: async () => ({ text: async () => files.get(name) ?? '' }),
      createWritable: async () => {
        let buf = ''
        return {
          write: async (d: string) => void (buf += d),
          close: async () => {
            files.set(name, buf)
            log.push(`write ${where}${name}`)
          },
        }
      },
    }
  }

  async removeEntry(name: string) {
    if (!this.files.delete(name) && !this.dirs.delete(name)) throw Object.assign(new Error(`no ${name}`), { name: 'NotFoundError' })
    this.log.push(`remove ${this.path}${name}`)
  }

  async *values(): AsyncIterable<Folder | FolderFile> {
    for (const d of this.dirs.values()) yield d
    for (const n of this.files.keys()) yield await this.getFileHandle(n)
  }

  /** Test helper: the text at a path, or undefined. */
  read(path: string): string | undefined {
    const [head, ...rest] = path.split('/')
    return rest.length ? this.dirs.get(head)?.read(rest.join('/')) : this.files.get(head)
  }

  /** Test helper: writes a file, creating folders. */
  put(path: string, text: string) {
    const [head, ...rest] = path.split('/')
    if (!rest.length) {
      this.files.set(head, text)
      return
    }
    if (!this.dirs.has(head)) this.dirs.set(head, new MemoryFolder(head, this.log, `${this.path}${head}/`))
    this.dirs.get(head)!.put(rest.join('/'), text)
  }
}
