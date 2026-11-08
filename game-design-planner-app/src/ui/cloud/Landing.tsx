import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { enterLocalMode, useCloud } from '../../core/cloud/session'
import { setLanguage } from '../../core/i18n'
import { SignInForm } from './SignInForm'

/** Only in-app paths are accepted as `next` (no open redirects). */
export const safeNext = (v: string | null, fallback = '/projects') => (v && /^\/[\w\-/?=&%.]*$/.test(v) ? v : fallback)

const FEATURES = ['planners', 'genres', 'team', 'files'] as const

/** Public landing page: what the app is, sign-in, or continue without an account. */
export function Landing() {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const user = useCloud((s) => s.user)
  const next = safeNext(params.get('next'))

  const goLocal = () => {
    enterLocalMode()
    nav(next.startsWith('/projects') ? '/' : next)
  }

  return (
    <div className="landing">
      <header className="landing-top">
        <strong className="brand">{t('app.title')}</strong>
        <span className="spacer" />
        <button className="small" onClick={() => setLanguage(i18n.language === 'hu' ? 'en' : 'hu')}>{i18n.language === 'hu' ? 'English' : 'Magyar'}</button>
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <h1>{t('cloud.landing.title')}</h1>
          <p className="landing-lead">{t('cloud.landing.lead')}</p>
          <ul className="landing-features">
            {FEATURES.map((f) => (
              <li key={f}>
                <strong>{t(`cloud.landing.features.${f}.title`)}</strong>
                <span className="muted">{t(`cloud.landing.features.${f}.body`)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="landing-panel" aria-labelledby="landing-signin">
          {user ? (
            <>
              <h2 id="landing-signin">{t('cloud.landing.welcomeBack')}</h2>
              <p className="muted">{t('cloud.landing.signedInAs', { email: user.email })}</p>
              <Link className="button primary" to={next}>{t('cloud.landing.toProjects')}</Link>
            </>
          ) : (
            <>
              <h2 id="landing-signin">{t('cloud.landing.signIn')}</h2>
              <p className="muted">{t('cloud.landing.signInHint')}</p>
              <SignInForm next={next} />
            </>
          )}
          <hr />
          <button onClick={goLocal}>{t('cloud.landing.useLocal')}</button>
          <p className="muted small-print">{t('cloud.landing.useLocalHint')}</p>
        </section>
      </main>
    </div>
  )
}
