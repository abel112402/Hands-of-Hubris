import { useTranslation } from 'react-i18next'
import { setThemePref, THEME_PREFS, useThemePref, type ThemePref } from '../core/theme'
import { Icon, type IconName } from './Icon'
import { Segmented } from './motion'

const ICONS: Record<ThemePref, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' }

/** System / Light / Dark switch: all three visible, the current one pressed. A device preference, not project data. */
export function ThemeSwitch({ showLabels = false }: { showLabels?: boolean }) {
  const { t } = useTranslation()
  const pref = useThemePref()
  return (
    <div className="theme-switch" role="group" aria-label={t('theme.label')}>
      <Segmented>
        {THEME_PREFS.map((p) => (
          <button key={p} type="button" aria-pressed={pref === p} aria-label={t(`theme.${p}`)} title={t(`theme.${p}`)} onClick={() => setThemePref(p)}>
            <Icon name={ICONS[p]} />
            {showLabels && <span>{t(`theme.${p}`)}</span>}
          </button>
        ))}
      </Segmented>
    </div>
  )
}
