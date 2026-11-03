import { assertModelId, sendWithRetry } from '../security'
import { sseJson } from '../sse'
import type { AiProvider } from '../types'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
// The key travels in a header, never in the URL, so it cannot end up in logs or history.
const headers = (key: string) => ({ 'content-type': 'application/json', 'x-goog-api-key': key })

export const gemini: AiProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  defaultModel: 'gemini-2.0-flash',
  async *stream(req, key, signal) {
    const model = assertModelId(req.model)
    const res = await sendWithRetry(`${BASE}/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: req.maxOutputTokens, ...(req.json ? { responseMimeType: 'application/json' } : {}) },
      }),
      signal,
    }, key)
    for await (const ev of sseJson(res)) {
      for (const p of ev?.candidates?.[0]?.content?.parts ?? []) if (typeof p?.text === 'string' && p.text) yield { type: 'text', text: p.text }
      if (ev?.usageMetadata) yield { type: 'usage', usage: { inputTokens: ev.usageMetadata.promptTokenCount, outputTokens: ev.usageMetadata.candidatesTokenCount } }
    }
  },
  async listModels(key, signal) {
    const res = await sendWithRetry(`${BASE}/models?pageSize=200`, { method: 'GET', headers: headers(key), signal }, key, 1)
    const j = await res.json()
    return (j?.models ?? [])
      .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m: any) => {
        const id = String(m?.name ?? '').replace(/^models\//, '')
        return { id, label: String(m?.displayName ?? id) }
      })
      .filter((m: any) => m.id)
  },
}
