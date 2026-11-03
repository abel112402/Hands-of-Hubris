import type { AiProvider, ProviderId } from '../types'
import { anthropic } from './anthropic'
import { gemini } from './gemini'
import { openai } from './openai'

export const PROVIDERS: Record<ProviderId, AiProvider> = { openai, anthropic, gemini }
