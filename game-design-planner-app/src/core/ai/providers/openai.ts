import { sendWithRetry } from '../security'
import { assertModelId } from '../security'
import { sseJson } from '../sse'
import type { AiProvider, ModelInfo } from '../types'

const BASE = 'https://api.openai.com/v1'
const CHAT_MODEL = /^(gpt-|o\d|chatgpt-)/
const EXCLUDED = /(embedding|whisper|tts|audio|realtime|image|moderation|transcribe|search|dall-e|instruct)/

export const openai: AiProvider = {
  id: 'openai',
  label: 'OpenAI',
  defaultModel: 'gpt-4o-mini',
  async *stream(req, key, signal) {
    const body: Record<string, unknown> = {
      model: assertModelId(req.model),
      messages: [{ role: 'system', content: req.system }, ...req.messages],
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: req.maxOutputTokens,
    }
    if (req.json) body.response_format = { type: 'json_object' }
    const res = await sendWithRetry(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal,
    }, key)
    for await (const ev of sseJson(res)) {
      const text = ev?.choices?.[0]?.delta?.content
      if (typeof text === 'string' && text) yield { type: 'text', text }
      if (ev?.usage) yield { type: 'usage', usage: { inputTokens: ev.usage.prompt_tokens, outputTokens: ev.usage.completion_tokens } }
    }
  },
  async listModels(key, signal) {
    const res = await sendWithRetry(`${BASE}/models`, { method: 'GET', headers: { authorization: `Bearer ${key}` }, signal }, key, 1)
    const j = await res.json()
    const list: ModelInfo[] = (j?.data ?? [])
      .map((m: any) => String(m?.id ?? ''))
      .filter((id: string) => CHAT_MODEL.test(id) && !EXCLUDED.test(id))
      .sort()
      .map((id: string) => ({ id, label: id }))
    return list
  },
}
