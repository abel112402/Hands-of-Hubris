import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { COSTUMES, type CostumeId } from '../../core/mascots/cast'
import { useCostumeOn } from './wardrobeStore'
import { MASCOTS_ENABLED } from '../../core/mascots/config'

/**
 * Hubi's pictures, one folder per costume (src/assets/mascots/<costume>/<pose>.webp). Only `idle` exists for
 * every costume; any other pose falls back to it, so new poses can be added one file at a time.
 */
const FILES = import.meta.glob<string>('../../assets/mascots/*/*.webp', { eager: true, query: '?url', import: 'default' })

export type Pose = 'idle' | 'point' | 'cheer' | 'think' | 'peek'

export function mascotSrc(costume: CostumeId, pose: Pose = 'idle'): string | undefined {
  return FILES[`../../assets/mascots/${costume}/${pose}.webp`] ?? FILES[`../../assets/mascots/${costume}/idle.webp`]
}

/** Whether this pose has its own picture (not the idle fallback). */
export const hasPose = (costume: CostumeId, pose: Pose) => pose === 'idle' || !!FILES[`../../assets/mascots/${costume}/${pose}.webp`]

/** Costumes that have their idle picture: the test checks this covers every costume. */
export const availableCostumes = () => COSTUMES.filter((c) => !!mascotSrc(c))

/**
 * Hubi in a costume. Decorative by default (the text next to him carries the message); pass `labelled`
 * when the picture stands alone.
 */
export function Mascot({ costume, pose = 'idle', size = 88, labelled = false, always = false }: { costume: CostumeId; pose?: Pose; size?: number; labelled?: boolean; /** Show even when muted in the wardrobe (the wardrobe itself). */ always?: boolean }) {
  const { t } = useTranslation()
  const on = useCostumeOn(costume)
  const src = mascotSrc(costume, pose)
  if (!MASCOTS_ENABLED || !src || (!on && !always)) return null
  return (
    <img
      className={`mascot mascot-${costume}`}
      src={src}
      alt={labelled ? t('mascot.alt', { costume: t(`mascot.costume.${costume}`) }) : ''}
      style={{ height: size }}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )
}

/**
 * Hubi with a speech bubble. Renders nothing without a line, so callers can pass a flavor line as is.
 * A costume muted in the wardrobe leaves the line as a plain aside.
 */
export function HubiSays({ costume, pose, size, children, className = '' }: { costume: CostumeId; pose?: Pose; size?: number; children: ReactNode; className?: string }) {
  const on = useCostumeOn(costume)
  if (children == null || children === false) return null
  // Mascots off, or this costume muted: the line stays as the plain aside it was before Hubi.
  if (!MASCOTS_ENABLED || !on) return <p className={`flavor ${className}`.trim()}>{children}</p>
  return (
    <div className={`hubi-says ${className}`.trim()}>
      <Mascot costume={costume} pose={pose} size={size} />
      <p className="hubi-bubble">{children}</p>
    </div>
  )
}
