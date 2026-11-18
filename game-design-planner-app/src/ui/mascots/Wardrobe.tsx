import { useTranslation } from 'react-i18next'
import { COSTUMES } from '../../core/mascots/cast'
import { useFlavorLevel } from '../flavor/Flavor'
import { Mascot } from './Mascot'
import { useWardrobe } from './wardrobeStore'

/**
 * Hubi's wardrobe (Settings → personality): the eight costumes, when he wears each, and a switch per costume.
 * A switched-off costume never appears; its lines stay as plain asides.
 */
export function Wardrobe() {
  const { t } = useTranslation()
  const muted = useWardrobe((s) => s.muted)
  const toggle = useWardrobe((s) => s.toggle)
  const off = useFlavorLevel((s) => s.level === 'off')
  return (
    <section className="wardrobe" aria-labelledby="wardrobe-title">
      <h3 id="wardrobe-title">{t('mascot.wardrobe.title')}</h3>
      <p className="muted">{t(off ? 'mascot.wardrobe.hintOff' : 'mascot.wardrobe.hint')}</p>
      <ul className="wardrobe-grid">
        {COSTUMES.map((c) => {
          const on = !muted.includes(c)
          const name = t(`mascot.costume.${c}`)
          return (
            <li key={c}>
              <button
                className={'wardrobe-item' + (on ? '' : ' muted-costume')}
                aria-pressed={on}
                aria-label={t(on ? 'mascot.wardrobe.turnOff' : 'mascot.wardrobe.turnOn', { costume: name })}
                onClick={() => toggle(c)}
              >
                <Mascot costume={c} size={96} always />
                <strong>{name}</strong>
                <span className="muted">{t(`mascot.wardrobe.when.${c}`)}</span>
                <span className="wardrobe-state">{t(on ? 'mascot.wardrobe.on' : 'mascot.wardrobe.off')}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
