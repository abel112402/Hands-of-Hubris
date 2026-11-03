export type ProviderId = 'openai' | 'anthropic' | 'gemini'
export const PROVIDER_IDS: ProviderId[] = ['openai', 'anthropic', 'gemini']

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type AiRequest = {
  model: string
  system: string
  messages: ChatMessage[]
  maxOutputTokens: number
  json?: boolean
}

export type Usage = { inputTokens: number; outputTokens: number }

export type StreamEvent = { type: 'text'; text: string } | { type: 'usage'; usage: Partial<Usage> }

export type ModelInfo = { id: string; label: string }

export interface AiProvider {
  id: ProviderId
  label: string
  defaultModel: string
  stream(req: AiRequest, key: string, signal: AbortSignal): AsyncIterable<StreamEvent>
  listModels(key: string, signal: AbortSignal): Promise<ModelInfo[]>
}

export type AiErrorCode = 'auth' | 'rateLimit' | 'network' | 'blocked' | 'invalid' | 'aborted' | 'budget' | 'server' | 'config'

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AiError'
  }
}
