import { useEffect, useState } from 'react'
import { COSTUMES, type CostumeId } from '../../core/mascots/cast'
import { useFlavor } from '../flavor/Flavor'
import { Mascot } from './Mascot'
import { useWardrobe } from './wardrobeStore'

/**
 * The whole wardrobe in a row, for the finished walkthrough: every costume Hubi wore along the way, with the
 * all-done line under it. Muted costumes stay out of the picture.
 */
export function HubiLineup() {
  const muted = useWardrobe((s) => s.muted)
  const line = useFlavor({ keys: 'flavor.allDone', ctx: 'lineup' })
  const shown = COSTUMES.filter((c) => !muted.includes(c))
  if (!line || !shown.length) return null
  return (
    <figure className="hubi-lineup">
      <div className="hubi-lineup-row">
        {shown.map((c, i) => (
          <span key={c} style={{ ['--i' as string]: i }}>
            <Mascot costume={c} pose="cheer" size={96} />
          </span>
        ))}
      </div>
      <figcaption className="flavor">{line}</figcaption>
    </figure>
  )
}

const PARADE_MS = 260

/**
 * Hubi runs through every costume (the Konami easter egg). Ends on the wizard; with reduced motion it just
 * shows the wizard.
 */
export function CostumeParade({ size = 56 }: { size?: number }) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [i, setI] = useState(reduce ? COSTUMES.length : 0)
  useEffect(() => {
    if (i >= COSTUMES.length) return
    const id = setTimeout(() => setI(i + 1), PARADE_MS)
    return () => clearTimeout(id)
  }, [i])
  const costume: CostumeId = i < COSTUMES.length ? COSTUMES[i] : 'wizard'
  return <Mascot costume={costume} size={size} />
}
