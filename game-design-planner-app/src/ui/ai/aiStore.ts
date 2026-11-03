import { create } from 'zustand'
import type { ChatMessage } from '../../core/ai/types'
import type { DocFile } from '../../core/ai/docsIndex'
import type { Hint } from '../../core/hints/types'

/** Session-only UI state (never persisted). */
export const useAiUi = create<{
  tab: 'hints' | 'ai'
  setTab: (t: 'hints' | 'ai') => void
  hintRequest: Hint | null
  explain: (h: Hint) => void
  chat: ChatMessage[]
  setChat: (c: ChatMessage[]) => void
  folderDocs: DocFile[]
  setFolderDocs: (d: DocFile[]) => void
}>((set) => ({
  tab: 'hints',
  setTab: (tab) => set({ tab }),
  hintRequest: null,
  explain: (h) => set({ hintRequest: h, tab: 'ai' }),
  chat: [],
  setChat: (chat) => set({ chat }),
  folderDocs: [],
  setFolderDocs: (folderDocs) => set({ folderDocs }),
}))
