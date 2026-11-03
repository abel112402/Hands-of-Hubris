import { PROVIDERS } from './providers'
import { checkBudget, costOf, estimateTokens, recordUsage } from './budget'
import { useAiSession, useAiSettings, getKey } from './session'
import { AiError, type AiRequest, type ChatMessage, type ProviderId, type Usage } from './types'
import { redact } from './security'

export type RunInput = { system: string; messages: ChatMessage[]; json?: boolean; maxOutputTokens?: number }

export function currentConfig() {
  const { settings } = useAiSettings.getState()
  const provider = settings.provider
  const model = settings.models[provider] || PROVIDERS[provider].defaultModel
  return { settings, provider, model, hasKey: useAiSession.getState().hasKey[provider] }
}

export function estimateRequest(input: RunInput) {
  const { settings, provider, model } = currentConfig()
  const maxOut = input.maxOutputTokens ?? settings.maxOutputTokens
  const inTokens = estimateTokens(input.system + input.messages.map((m) => m.content).join('\n'))
  const cost = costOf(settings, provider, model, inTokens, maxOut)
  return { provider, model, inTokens, maxOut, cost, budget: checkBudget(settings, inTokens + maxOut, cost) }
}

export type RunHandle = { done: Promise<{ text: string; usage: Usage }>; abort: () => void }

/** Streams a completion. `onText` receives the accumulated text. Usage is recorded in the local budget ledger. */
export function runAi(input: RunInput, onText: (full: string) => void, opts: { overrideBudget?: boolean } = {}): RunHandle {
  const ctrl = new AbortController()
  const done = (async () => {
    const { settings, provider, model } = currentConfig()
    const key = getKey(provider)
    if (!key) throw new AiError('config', 'No API key set for the selected provider')
    const est = estimateRequest(input)
    if (!est.budget.ok && !opts.overrideBudget) throw new AiError('budget', 'Budget limit reached')
    const req: AiRequest = { model, system: input.system, messages: input.messages, maxOutputTokens: est.maxOut, json: input.json }
    const timer = setTimeout(() => ctrl.abort(), settings.timeoutSec * 1000)
    let text = ''
    const usage: Usage = { inputTokens: 0, outputTokens: 0 }
    try {
      for await (const ev of PROVIDERS[provider].stream(req, key, ctrl.signal)) {
        if (ev.type === 'text') { text += ev.text; onText(text) }
        else {
          if (ev.usage.inputTokens) usage.inputTokens = ev.usage.inputTokens
          if (ev.usage.outputTokens) usage.outputTokens = ev.usage.outputTokens
        }
      }
    } catch (e) {
      if (e instanceof AiError) throw e
      if (ctrl.signal.aborted) throw new AiError('aborted', 'Request cancelled or timed out')
      throw new AiError('network', redact(e instanceof Error ? e.message : 'Stream error', key))
    } finally {
      clearTimeout(timer)
      // Cancelled or failed requests are still accounted for with the best available numbers.
      const inT = usage.inputTokens || est.inTokens
      const outT = usage.outputTokens || estimateTokens(text)
      recordUsage(inT + outT, costOf(settings, provider, model, inT, outT) ?? 0)
    }
    return { text, usage }
  })()
  return { done, abort: () => ctrl.abort() }
}

export async function fetchModels(provider: ProviderId) {
  const key = getKey(provider)
  if (!key) throw new AiError('config', 'No API key set for this provider')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const list = await PROVIDERS[provider].listModels(key, ctrl.signal)
    useAiSession.getState().setModels(provider, list)
    return list
  } finally {
    clearTimeout(timer)
  }
}
