import { AiError } from './types'

/** The only hosts the app may send requests (and API keys) to. Mirrors the CSP connect-src. */
export const ALLOWED_HOSTS = ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com'] as const

export function assertAllowedUrl(url: string): URL {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new AiError('blocked', 'Invalid URL')
  }
  if (u.protocol !== 'https:' || !(ALLOWED_HOSTS as readonly string[]).includes(u.hostname) || u.username || u.password || u.port)
    throw new AiError('blocked', 'Requests are only allowed to the supported AI providers')
  return u
}

/** Model ids are placed into URLs and bodies, so only a conservative character set is accepted. */
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/
export const isValidModelId = (id: string) => MODEL_RE.test(id)
export function assertModelId(id: string): string {
  if (!isValidModelId(id)) throw new AiError('config', 'Invalid model name')
  return id
}

const KEY_LIKE = /(sk-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|Bearer\s+[A-Za-z0-9._-]{12,})/g

/** Removes anything that looks like an API key (and the known key itself) from text shown or logged. */
export function redact(text: string, key?: string): string {
  let out = text
  if (key && key.length >= 6) out = out.split(key).join('[redacted]')
  return out.replace(KEY_LIKE, '[redacted]').slice(0, 400)
}

export function cleanKey(raw: string): string {
  const k = raw.trim()
  if (!/^[\x21-\x7e]{8,300}$/.test(k)) throw new AiError('config', 'The API key contains invalid characters or is too short')
  return k
}

/** fetch wrapper: HTTPS allowlist, no cookies, no referrer, no cache, no redirects. */
export async function secureFetch(url: string, init: RequestInit & { signal: AbortSignal }): Promise<Response> {
  assertAllowedUrl(url)
  try {
    return await fetch(url, {
      ...init,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      redirect: 'error',
      mode: 'cors',
    })
  } catch (e) {
    if (init.signal.aborted) throw new AiError('aborted', 'Request cancelled')
    if (e instanceof AiError) throw e
    throw new AiError('network', 'Network or CORS error while contacting the provider')
  }
}

export async function checkResponse(res: Response, key: string): Promise<void> {
  if (res.ok) return
  let detail = ''
  try {
    const j = await res.json()
    detail = String(j?.error?.message ?? j?.error ?? j?.message ?? '')
  } catch {
    /* body is optional */
  }
  detail = redact(detail, key)
  if (res.status === 401 || res.status === 403) throw new AiError('auth', `Authentication failed (${res.status}). ${detail}`.trim())
  if (res.status === 429) throw new AiError('rateLimit', `Rate limit or quota exceeded. ${detail}`.trim())
  if (res.status >= 500) throw new AiError('server', `Provider error (${res.status}). ${detail}`.trim())
  throw new AiError('invalid', `Request rejected (${res.status}). ${detail}`.trim())
}

/** Sends a request, retrying a couple of times on 429/5xx before any output was received. */
export async function sendWithRetry(url: string, init: RequestInit & { signal: AbortSignal }, key: string, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await secureFetch(url, init)
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 600 * 2 ** attempt)
        init.signal.addEventListener('abort', () => { clearTimeout(t); reject(new AiError('aborted', 'Request cancelled')) }, { once: true })
      })
      continue
    }
    await checkResponse(res, key)
    return res
  }
}

/** True if the text contains something shaped like an API key (used to keep secrets out of the project file). */
export const looksLikeSecret = (text: string): boolean => new RegExp(KEY_LIKE.source).test(text)
