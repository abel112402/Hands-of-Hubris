import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../core/store/store'
import { rankReflections, reflections } from '../../core/mascots/reflect'
import { fillParams, nthLine } from '../../core/mascots/lines'
import { asLines, daySeed } from '../../core/flavor/pick'
import { useHints } from '../hints/useHints'
import { useFlavorLevel } from '../flavor/Flavor'
import { HubiSays } from './Mascot'
import { useWardrobe } from './wardrobeStore'

/**
 * Hubi's status report on the workspace: the most relevant project-wide remark, in the costume that fits it
 * (usually the suit). "Another one" walks the rest. Hidden when personality is off.
 */
export function StatusCard() {
  const { t, i18n } = useTranslation()
  const level = useFlavorLevel((s) => s.level)
  const project = useStore((s) => s.project)
  const muted = useWardrobe((s) => s.muted)
  const hintsTotal = useHints().all.length
  const list = useMemo(
    () => rankReflections(reflections(project, { hintsTotal })).filter((r) => !muted.includes(r.costume)),
    [project, hintsTotal, muted],
  )
  const [n, setN] = useState(0)
  if (level === 'off' || !list.length) return null
  const r = list[n % list.length]
  const lng = i18n.resolvedLanguage ?? i18n.language
  const line = nthLine(asLines(i18n.getResource(lng, 'translation', `mascot.reflect.${r.key}`)), `${daySeed()}|${r.key}`, 0)
  if (!line) return null
  return (
    <section className="hubi-status" aria-label={t('mascot.status.title')}>
      <div className="hubi-status-head">
        <span className="hubi-kind">{t('mascot.status.title')}</span>
        {list.length > 1 && <button className="small" onClick={() => setN(n + 1)}>{t('mascot.companion.more')}</button>}
      </div>
      <HubiSays costume={r.costume} pose="think" size={80}>{fillParams(line, r.params)}</HubiSays>
    </section>
  )
}
