import { assertModelId, sendWithRetry } from '../security'
import { sseJson } from '../sse'
import type { AiProvider } from '../types'

const BASE = 'https://api.anthropic.com/v1'
const headers = (key: string) => ({
  'content-type': 'application/json',
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
})

export const anthropic: AiProvider = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  defaultModel: 'claude-sonnet-4-5',
  async *stream(req, key, signal) {
    const res = await sendWithRetry(`${BASE}/messages`, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({
        model: assertModelId(req.model),
        max_tokens: req.maxOutputTokens,
        system: req.system,
        messages: req.messages,
        stream: true,
      }),
      signal,
    }, key)
    for await (const ev of sseJson(res)) {
      if (ev?.type === 'content_block_delta' && typeof ev.delta?.text === 'string') yield { type: 'text', text: ev.delta.text }
      else if (ev?.type === 'message_start' && ev.message?.usage) yield { type: 'usage', usage: { inputTokens: ev.message.usage.input_tokens } }
      else if (ev?.type === 'message_delta' && ev.usage) yield { type: 'usage', usage: { outputTokens: ev.usage.output_tokens } }
      else if (ev?.type === 'error') throw new Error(String(ev.error?.message ?? 'Stream error').slice(0, 200))
    }
  },
  async listModels(key, signal) {
    const res = await sendWithRetry(`${BASE}/models?limit=100`, { method: 'GET', headers: headers(key), signal }, key, 1)
    const j = await res.json()
    return (j?.data ?? []).map((m: any) => ({ id: String(m?.id ?? ''), label: String(m?.display_name ?? m?.id ?? '') })).filter((m: any) => m.id)
  },
}
