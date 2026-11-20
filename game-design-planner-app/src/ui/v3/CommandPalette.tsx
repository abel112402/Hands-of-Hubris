import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../core/store/store'
import { buildPaletteIndex, searchPalette, type PaletteItem } from '../../core/palette'
import { Icon, type IconName } from '../Icon'
import { ModuleIcon } from '../ModuleIcon'

/** An entry the shell adds: a page to open (`to`) or an action to run (`run`). */
export type PaletteExtra = PaletteItem & { run?: () => void; icon?: IconName }

/**
 * Ctrl+K: jump to any planner, section or named entry, or run an action. A combobox: type to filter,
 * ↑ ↓ to choose, Enter to open, Escape to close.
 */
export function CommandPalette({ extras, onClose }: { extras: PaletteExtra[]; onClose: () => void }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const project = useStore((s) => s.project)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const index = useMemo(() => [...extras, ...buildPaletteIndex(project)], [extras, project])
  const results = useMemo(() => searchPalette(index, query, 30), [index, query])
  const at = Math.min(active, Math.max(0, results.length - 1))

  const open = (item: PaletteItem | undefined) => {
    if (!item) return
    onClose()
    const run = (item as PaletteExtra).run
    if (run) run()
    else if (item.to) nav(item.to)
  }

  return (
    <div className="palette3-layer">
      <div className="palette3-scrim" aria-hidden="true" onClick={onClose} />
      <div className="palette3" role="dialog" aria-modal="true" aria-label={t('v3.palette.label')}>
        <div className="palette3-input">
          <Icon name="search" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette3-list"
            aria-activedescendant={results[at] ? `palette3-${at}` : undefined}
            aria-label={t('v3.palette.label')}
            placeholder={t('v3.palette.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive(Math.min(at + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive(Math.max(at - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                open(results[at])
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="palette3-list" role="listbox" aria-label={t('v3.palette.results')}>
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`palette3-${i}`}
              role="option"
              aria-selected={i === at}
              className={i === at ? 'on' : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => open(r)}
            >
              <span className="palette3-icon" aria-hidden="true">
                {r.doc ? <ModuleIcon id={r.doc} /> : <Icon name={(r as PaletteExtra).icon ?? 'compass'} />}
              </span>
              <span className="palette3-label">
                {r.label}
                {r.detail && <span className="palette3-detail">{r.detail}</span>}
              </span>
              <span className="palette3-kind">{t(`v3.palette.kind.${r.kind}`)}</span>
            </li>
          ))}
        </ul>
        {!results.length && <p className="palette3-empty">{t('v3.palette.empty')}</p>}
        <p className="palette3-foot">{t('v3.palette.keys')}</p>
      </div>
    </div>
  )
}
