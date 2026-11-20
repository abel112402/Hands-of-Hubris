import { engineStatusOf, type EngineStatus } from '../core/engine/report'
import { useProject } from './hooks'

const ENGINE = { unity: 'Unity', godot: 'Godot', unreal: 'Unreal' } as const

/** Icon, short text and full explanation of an engine status. State is never shown by colour alone. */
export function engineStatusText(st: EngineStatus): { icon: string; short: string; long: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  const e = ENGINE[st.engine as keyof typeof ENGINE] ?? st.engine
  if (st.kind === 'class') {
    if (st.status === 'implemented') return { icon: '✓', short: e, long: `${e}: written`, tone: 'ok' }
    if (st.status === 'stub') return { icon: '◐', short: `${e} ${st.todo} TODO`, long: `${e}: ${st.todo} of ${st.methods} method bodies still to write`, tone: 'warn' }
    return { icon: '✗', short: e, long: `${e}: no file for this class yet`, tone: 'bad' }
  }
  if (st.status === 'implemented') return { icon: '✓', short: e, long: `${e}: ${st.key} is in the project`, tone: 'ok' }
  if (st.status === 'incomplete') return { icon: '⚠', short: `${e} ${st.issues.length || ''}`.trim(), long: `${e}: ${st.key} — ${st.issues.join('; ') || 'incomplete'}`, tone: 'warn' }
  if (st.status === 'deprecated') return { icon: '–', short: e, long: `${e}: ${st.key} is marked as no longer in the plan`, tone: 'muted' }
  return { icon: '✗', short: e, long: `${e}: ${st.key} has no asset yet`, tone: 'bad' }
}

/** What the last engine report says about this entry; nothing when there is no report or it does not mention the entry. */
export function EngineBadge({ entity }: { entity: { id?: unknown } }) {
  const project = useProject()
  const st = typeof entity.id === 'string' ? engineStatusOf(project, entity.id) : undefined
  if (!st) return null
  const t = engineStatusText(st)
  return (
    <span className={'engine-badge ' + t.tone} title={t.long} aria-label={t.long}>
      <span aria-hidden="true">{t.icon}</span> {t.short}
    </span>
  )
}
