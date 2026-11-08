import { useTranslation } from 'react-i18next'
import { GENRES } from '../../modules/genres'
import { MAX_GENRES, getGenre, recommendEditors } from '../../core/genre'
import { getModule } from '../../core/modules/registry'
import type { ProjectProfile } from '../../core/model/types'

export type GenreDraft = { genres: string[]; custom: string }

export const draftFromProfile = (p: ProjectProfile): GenreDraft => ({
  genres: [...p.genres],
  custom: (p.customGenres ?? []).join(', '),
})

export const customList = (custom: string) => custom.split(',').map((s) => s.trim()).filter(Boolean)

/**
 * Controlled multi-genre picker with a live recommendation preview. Stateless and store-free, so the
 * same component can serve the project page today and a "new project" page later.
 */
export function GenrePicker({ value, onChange, base }: { value: GenreDraft; onChange: (v: GenreDraft) => void; base?: ProjectProfile }) {
  const { t } = useTranslation()
  const unknown = value.genres.filter((id) => !getGenre(id))
  const full = value.genres.length >= MAX_GENRES
  const toggle = (id: string, on: boolean) =>
    onChange({ ...value, genres: on ? [...value.genres, id] : value.genres.filter((g) => g !== id) })
  const preview = recommendEditors({ version: 1, ...base, genres: value.genres, customGenres: customList(value.custom) })

  return (
    <div className="genre-picker">
      <fieldset>
        <legend>{t('genres.pickerTitle')}</legend>
        <p className="muted">{t('genres.pickerHint')}</p>
        <div className="genre-options">
          {GENRES.map((g) => {
            const on = value.genres.includes(g.id)
            return (
              <label key={g.id} className={`genre-option${on ? ' on' : ''}`}>
                <input type="checkbox" checked={on} disabled={!on && full} onChange={(e) => toggle(g.id, e.target.checked)} />
                <span className="genre-icon" aria-hidden="true">{g.icon}</span>
                <span>
                  <strong>{g.label}</strong>
                  <span className="muted genre-summary">{g.summary}</span>
                </span>
              </label>
            )
          })}
          {unknown.map((id) => (
            <label key={id} className="genre-option on">
              <input type="checkbox" checked onChange={() => toggle(id, false)} />
              <span className="genre-icon" aria-hidden="true">❔</span>
              <span>
                <strong>{t('genres.unknown', { id })}</strong>
                <span className="muted genre-summary">{t('genres.unknownHint')}</span>
              </span>
            </label>
          ))}
        </div>
        {full && <p className="muted" role="status">{t('genres.maxReached', { count: MAX_GENRES })}</p>}
        <label className="genre-custom">
          <span>{t('genres.other')}</span>
          <input value={value.custom} maxLength={300} placeholder={t('genres.otherPlaceholder')} onChange={(e) => onChange({ ...value, custom: e.target.value })} />
        </label>
      </fieldset>
      <div className="genre-preview" aria-live="polite">
        <strong>{t('genres.preview')}</strong>
        <ol>
          {preview.map((r) => (
            <li key={r.docId}>{getModule(r.docId)?.icon} {getModule(r.docId)?.title}</li>
          ))}
        </ol>
      </div>
    </div>
  )
}
