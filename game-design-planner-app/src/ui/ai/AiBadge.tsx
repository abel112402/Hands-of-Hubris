import { useTranslation } from 'react-i18next'

/** Marks entries that were created or changed by an approved AI proposal. */
export function AiBadge({ entity }: { entity: object }) {
  const { t } = useTranslation()
  const m = (entity as { _ai?: { model?: string; at?: string } })._ai
  if (!m || typeof m !== 'object') return null
  return (
    <span className="ai-badge" title={t('ai.badgeTitle', { model: String(m.model ?? '?'), date: m.at ? new Date(m.at).toLocaleString() : '' })}>
      🤖
    </span>
  )
}
