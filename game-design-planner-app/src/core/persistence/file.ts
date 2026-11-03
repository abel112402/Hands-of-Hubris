/* File System Access API with a download / file-input fallback. */
type FSHandle = {
  name: string
  createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>
  getFile: () => Promise<File>
}

const w = window as any
export const hasFileSystemAccess = typeof w.showSaveFilePicker === 'function'

let currentHandle: FSHandle | null = null
export const currentFileName = () => currentHandle?.name

const PICKER_TYPES = [{ description: 'Planner project', accept: { 'application/json': ['.hohplan.json', '.json'] } }]

export function downloadText(filename: string, text: string, mime = 'application/json') {
  downloadBlob(filename, new Blob([text], { type: mime }))
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function saveToFile(text: string, suggestedName: string, saveAs = false): Promise<string | null> {
  if (hasFileSystemAccess) {
    try {
      if (!currentHandle || saveAs) {
        currentHandle = await w.showSaveFilePicker({ suggestedName, types: PICKER_TYPES })
      }
      const writable = await currentHandle!.createWritable()
      await writable.write(text)
      await writable.close()
      return currentHandle!.name
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null
      throw e
    }
  }
  downloadText(suggestedName, text)
  return suggestedName
}

export async function openFromFile(): Promise<{ text: string; name: string } | null> {
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [handle] = await w.showOpenFilePicker({ types: PICKER_TYPES })
      currentHandle = handle
      const file = await handle.getFile()
      return { text: await file.text(), name: file.name }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null
      throw e
    }
  }
  return pickWithInput('.json,.hohplan.json')
}

export function pickWithInput(accept: string): Promise<{ text: string; name: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = async () => {
      const file = input.files?.[0]
      currentHandle = null
      resolve(file ? { text: await file.text(), name: file.name } : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export const forgetHandle = () => {
  currentHandle = null
}
