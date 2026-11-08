import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { GROUPS, MODULES } from '../../core/modules/registry'
import {
  genreLabel,
  hasEditorOverrides,
  hasGenreProfile,
  readProfile,
  recommendEditors,
  restoreEditorDefaults,
  setEditorRecommended,
  setGenres,
  type RecommendationReason,
} from '../../core/genre'
import { useStore } from '../../core/store/store'
import { GenrePicker, customList, draftFromProfile, type GenreDraft } from './GenrePicker'

/** "Survival · RPG · Other: Cozy" — selected genres for headings and summaries. */
export function genreNames(genres: string[], custom: string[] = []) {
  return [...genres.map(genreLabel), ...custom].join(' · ')
}

/** One short line explaining why an editor is recommended. */
export function reasonText(t: TFunction, reasons: RecommendationReason[]) {
  return reasons
    .map((r) =>
      r.kind === 'genre' ? `${genreLabel(r.genre)}: ${r.why}` : r.kind === 'foundation' ? `${t('genres.whyFoundation')}: ${r.why}` : r.kind === 'manual' ? t('genres.whyManual') : t('genres.whyGeneral'),
    )
    .join(' · ')
}

/** Genre summary on the planner menu, with inline editing and editor customization. */
export function GenreProfilePanel() {
  const { t } = useTranslation()
  const project = useStore((s) => s.project)
  const profile = readProfile(project)
  const [draft, setDraft] = useState<GenreDraft | null>(null)
  const names = genreNames(profile.genres, profile.customGenres)
  const recommended = new Set(recommendEditors(profile).map((r) => r.docId))

  const apply = () => {
    if (!draft) return
    useStore.getState().mutate((p) => setGenres(p, draft.genres, customList(draft.custom)))
    setDraft(null)
  }

  return (
    <section className="genre-panel" aria-labelledby="genre-panel-title">
      <div className="genre-bar">
        <h2 id="genre-panel-title">{t('genres.title')}</h2>
        {names ? <span className="genre-names">{names}</span> : <span className="muted">{t('genres.notSet')}</span>}
        <span className="spacer" />
        {!draft && (
          <button className={names ? '' : 'primary'} onClick={() => setDraft(draftFromProfile(profile))}>
            {names ? t('genres.edit') : t('genres.choose')}
          </button>
        )}
      </div>
      {draft && (
        <div className="genre-editor">
          <GenrePicker value={draft} onChange={setDraft} base={profile} />
          <div className="row">
            <button className="primary" onClick={apply}>{t('genres.apply')}</button>
            <button onClick={() => setDraft(null)}>{t('genres.cancel')}</button>
            <span className="muted">{t('genres.safe')}</span>
          </div>
        </div>
      )}
      {!draft && hasGenreProfile(profile) && (
          <details className="genre-customize">
            <summary>{t('genres.customize')}</summary>
            <p className="muted">{t('genres.customizeHint')}</p>
            {GROUPS.map((g) => {
              const mods = MODULES.filter((m) => m.group === g.id)
              if (!mods.length) return null
              return (
                <fieldset key={g.id}>
                  <legend>{g.label}</legend>
                  {mods.map((m) => (
                    <label key={m.id} className="genre-module">
                      <input
                        type="checkbox"
                        checked={recommended.has(m.id)}
                        onChange={(e) => useStore.getState().mutate((p) => setEditorRecommended(p, m.id, e.target.checked))}
                      />
                      {m.icon} {m.title}
                    </label>
                  ))}
                </fieldset>
              )
            })}
            <button disabled={!hasEditorOverrides(profile)} onClick={() => useStore.getState().mutate(restoreEditorDefaults)}>
              {t('genres.restore')}
            </button>
          </details>
      )}
    </section>
  )
}
