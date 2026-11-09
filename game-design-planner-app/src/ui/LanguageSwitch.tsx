import { useTranslation } from 'react-i18next'
import { setLanguage } from '../core/i18n'
import { Icon } from './Icon'
import { Segmented } from './motion'

const LANGS = [
  { id: 'en', short: 'EN', name: 'English' },
  { id: 'hu', short: 'HU', name: 'Magyar' },
] as const

/** EN / HU switch: both options visible, the current one pressed. Each is named in its own language. */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation()
  const current = i18n.language === 'hu' ? 'hu' : 'en'
  return (
    <div className="lang-switch" role="group" aria-label={t('cloud.landing.language')}>
      <Icon name="globe" className="lang-switch-icon" />
      <Segmented>
        {LANGS.map((l) => (
          <button key={l.id} lang={l.id} aria-pressed={current === l.id} aria-label={l.name} title={l.name} onClick={() => setLanguage(l.id)}>
            {l.short}
          </button>
        ))}
      </Segmented>
    </div>
  )
}
