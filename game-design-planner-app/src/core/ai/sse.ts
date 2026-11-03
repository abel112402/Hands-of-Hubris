import { AiError } from './types'

const MAX_BUFFER = 2_000_000

/** Parses a Server-Sent Events body into JSON payloads of `data:` lines. */
export async function* sseJson(res: Response): AsyncGenerator<any> {
  if (!res.body) throw new AiError('network', 'Empty response')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      if (buf.length > MAX_BUFFER) throw new AiError('invalid', 'Response too large')
      let idx: number
      while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
        const block = buf.slice(0, idx)
        buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '')
        const data = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n')
        if (!data || data === '[DONE]') continue
        try {
          yield JSON.parse(data)
        } catch {
          /* ignore keep-alive or malformed events */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
