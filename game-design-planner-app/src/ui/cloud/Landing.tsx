import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '../BrandMark'
import { enterLocalMode, useCloud } from '../../core/cloud/session'
import { siteLinks } from '../../core/cloud/config'
import { APP_VERSION } from '../../core/model/types'
import { Icon, type IconName } from '../Icon'
import { LanguageSwitch } from '../LanguageSwitch'
import { AutoHeight, Segmented } from '../motion'
import { SignInForm } from './SignInForm'
import { WorkspaceIllustration } from './WorkspaceIllustration'

/** Only in-app paths are accepted as `next` (no open redirects). */
export const safeNext = (v: string | null, fallback = '/projects') => (v && /^\/[\w\-/?=&%.]*$/.test(v) ? v : fallback)

const FEATURES: { id: 'planners' | 'genres' | 'files'; icon: IconName }[] = [
  { id: 'planners', icon: 'layers' },
  { id: 'genres', icon: 'compass' },
  { id: 'files', icon: 'save' },
]

type Path = 'cloud' | 'local'
const PATH_KEY = 'hohplan:landingPath'
const readPath = (): Path => {
  try {
    return localStorage.getItem(PATH_KEY) === 'local' ? 'local' : 'cloud'
  } catch {
    return 'cloud'
  }
}

/** Public landing page: what the app is, then one of two ways in — an account (team, cloud) or local files. */
export function Landing() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const user = useCloud((s) => s.user)
  const next = safeNext(params.get('next'))
  const [path, setPathState] = useState<Path>(readPath)
  const setPath = (p: Path) => {
    setPathState(p)
    try {
      localStorage.setItem(PATH_KEY, p)
    } catch {
      /* not remembered */
    }
  }

  const goLocal = () => {
    enterLocalMode()
    nav(next.startsWith('/projects') ? '/' : next)
  }

  return (
    <div className="landing">
      <header className="landing-top">
        <strong className="brand"><BrandMark size={24} /><span className="brand-name">{t('app.title')}</span></strong>
        <span className="spacer" />
        <LanguageSwitch />
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <p className="eyebrow">{t('cloud.landing.eyebrow')}</p>
          <h1>{t('cloud.landing.title')}</h1>
          <p className="landing-lead">{t('cloud.landing.lead')}</p>
          <ul className="landing-features">
            {FEATURES.map((f) => (
              <li key={f.id}>
                <span className="landing-feature-icon" aria-hidden="true"><Icon name={f.icon} strokeWidth={1.75} /></span>
                <span>
                  <strong>{t(`cloud.landing.features.${f.id}.title`)}</strong>
                  <span className="muted">{t(`cloud.landing.features.${f.id}.body`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-panel" aria-labelledby="landing-signin">
          {user ? (
            <>
              <h2 id="landing-signin">{t('cloud.landing.welcomeBack')}</h2>
              <p className="muted">{t('cloud.landing.signedInAs', { email: user.email })}</p>
              <Link className="button primary landing-cta" to={next}>{t('cloud.landing.toProjects')}</Link>
              <button className="ghost" onClick={goLocal}>{t('cloud.landing.useLocal')}</button>
            </>
          ) : (
            <>
              <p className="eyebrow" id="landing-path-label">{t('cloud.landing.pathLabel')}</p>
              <Segmented className="landing-paths" role="group" aria-labelledby="landing-path-label">
                <button aria-pressed={path === 'cloud'} onClick={() => setPath('cloud')}><Icon name="users" /> {t('cloud.landing.pathCloud')}</button>
                <button aria-pressed={path === 'local'} onClick={() => setPath('local')}><Icon name="save" /> {t('cloud.landing.pathLocal')}</button>
              </Segmented>
              {/* The card's height follows the chosen path instead of jumping, and the content crossfades. */}
              <AutoHeight>
              {path === 'cloud' ? (
                <div key="cloud" className="landing-path">
                  <h2 id="landing-signin">{t('cloud.landing.signIn')}</h2>
                  <p className="muted">{t('cloud.landing.cloudBody')} {t('cloud.landing.signInHint')}</p>
                  <SignInForm next={next} />
                </div>
              ) : (
                <div key="local" className="landing-path">
                  <h2 id="landing-signin">{t('cloud.landing.localTitle')}</h2>
                  <p className="muted">{t('cloud.landing.useLocalHint')}</p>
                  <button className="primary landing-cta" onClick={goLocal}>{t('cloud.landing.useLocal')}</button>
                  <p className="muted small-print">{t('cloud.landing.localLater')}</p>
                </div>
              )}
              </AutoHeight>
            </>
          )}
        </section>

        <figure className="landing-shot">
          <WorkspaceIllustration label={t('cloud.landing.shotAlt')} />
        </figure>
      </main>
      <footer className="landing-foot">
        <span>{t('app.title')} · {t('cloud.landing.version', { version: APP_VERSION })}</span>
        <span>{t('cloud.landing.offline')}</span>
        <span className="spacer" />
        {siteLinks.privacy && <a href={siteLinks.privacy} target="_blank" rel="noopener noreferrer">{t('cloud.landing.privacy')}</a>}
        {siteLinks.terms && <a href={siteLinks.terms} target="_blank" rel="noopener noreferrer">{t('cloud.landing.terms')}</a>}
      </footer>
    </div>
  )
}
