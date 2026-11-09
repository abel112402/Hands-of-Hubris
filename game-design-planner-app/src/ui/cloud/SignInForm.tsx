import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { CloudError, getBackend, type OAuthProvider } from '../../core/cloud/backend'
import { authRedirectUrl, cloudConfig } from '../../core/cloud/config'
import { rememberReturnTo } from './guards'

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void }
  }
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** Cloudflare Turnstile widget; only rendered when a site key is configured. */
function Turnstile({ onToken }: { onToken: (token: string | undefined) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    const render = () => {
      if (cancelled || !ref.current || !window.turnstile) return
      window.turnstile.render(ref.current, {
        sitekey: cloudConfig.turnstileSiteKey,
        callback: (t: string) => onToken(t),
        'expired-callback': () => onToken(undefined),
      })
    }
    if (window.turnstile) render()
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`)
      if (!s) {
        s = document.createElement('script')
        s.src = TURNSTILE_SRC
        s.async = true
        document.head.appendChild(s)
      }
      s.addEventListener('load', render)
    }
    return () => {
      cancelled = true
    }
  }, [onToken])
  return <div ref={ref} className="turnstile" />
}

const PROVIDER_LABEL: Record<OAuthProvider, string> = { github: 'GitHub', google: 'Google' }

/** Seconds before the link can be sent again; matches the server's own e-mail rate limit window. */
export const RESEND_COOLDOWN = 60

/** Seconds left until `until` (ms timestamp), ticking once a second while above zero. */
function useCountdown(until: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until <= Date.now()) return
    const id = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= until) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [until])
  return Math.max(0, Math.ceil((until - now) / 1000))
}

/** Passwordless sign-in: e-mail magic link, plus OAuth buttons for providers enabled on the server. */
export function SignInForm({ next }: { next: string }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  const [captcha, setCaptcha] = useState<string | undefined>()
  const [resendAt, setResendAt] = useState(0)
  const [resending, setResending] = useState(false)
  const wait = useCountdown(resendAt)
  const sentHeading = useRef<HTMLHeadingElement>(null)
  const needsCaptcha = !!cloudConfig.turnstileSiteKey

  useEffect(() => {
    void getBackend()?.enabledProviders().then(setProviders)
  }, [])

  // The form is replaced by the confirmation; move focus there so keyboard and screen-reader users follow.
  useEffect(() => {
    if (status === 'sent') sentHeading.current?.focus()
  }, [status])

  const deliver = async () => {
    const backend = getBackend()
    if (!backend) return false
    rememberReturnTo(next)
    await backend.signInWithEmail(email.trim(), authRedirectUrl(), captcha)
    setResendAt(Date.now() + RESEND_COOLDOWN * 1000)
    return true
  }
  const failure = (err: unknown) => (err instanceof CloudError && err.code === 'rate' ? t('cloud.errors.rate') : t('cloud.signIn.failed'))

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!getBackend()) return
    setStatus('sending')
    setError('')
    try {
      if (await deliver()) setStatus('sent')
    } catch (err) {
      setStatus('error')
      setError(failure(err))
    }
  }

  const resend = async () => {
    setResending(true)
    setError('')
    try {
      await deliver()
    } catch (err) {
      setError(failure(err))
    } finally {
      setResending(false)
    }
  }

  const oauth = async (p: OAuthProvider) => {
    rememberReturnTo(next)
    try {
      await getBackend()?.signInWithProvider(p, authRedirectUrl())
    } catch {
      setStatus('error')
      setError(t('cloud.signIn.failed'))
    }
  }

  if (status === 'sent')
    return (
      <div className="signin-sent" role="status">
        <h3 ref={sentHeading} tabIndex={-1}>{t('cloud.signIn.checkEmail')}</h3>
        <p><Trans i18nKey="cloud.signIn.sentTo" values={{ email }} components={[<strong key="a" className="signin-address" />]} /></p>
        <p className="muted">{t('cloud.signIn.sameBrowser')}</p>
        <div className="signin-sent-actions">
          {/* A Turnstile token is single-use, so with a captcha "send again" goes back to the form instead. */}
          {!needsCaptcha && (
            <button disabled={wait > 0 || resending} aria-busy={resending} onClick={() => void resend()}>
              {wait > 0 ? t('cloud.signIn.resendIn', { seconds: wait }) : t('cloud.signIn.resend')}
            </button>
          )}
          <button className="ghost" onClick={() => setStatus('idle')}>{t('cloud.signIn.useOther')}</button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    )

  // The submit button stays enabled while the address is empty: the browser's own required/e-mail
  // check explains what is missing, instead of a faded button that looks broken.
  return (
    <div className="signin">
      <form onSubmit={(e) => void send(e)} aria-busy={status === 'sending'} aria-describedby={error ? 'signin-error' : undefined}>
        <label htmlFor="signin-email">{t('cloud.signIn.email')}</label>
        <input id="signin-email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        {needsCaptcha && <Turnstile onToken={setCaptcha} />}
        <button className="primary" type="submit" disabled={status === 'sending' || (needsCaptcha && !captcha)}>
          {status === 'sending' ? t('cloud.signIn.sending') : t('cloud.signIn.sendLink')}
        </button>
        <p className="muted small-print">{t('cloud.signIn.noPassword')} {t('cloud.signIn.privacy')}</p>
      </form>
      {providers.length > 0 && (
        <div className="signin-providers">
          <span className="muted">{t('cloud.signIn.or')}</span>
          {providers.map((p) => (
            <button key={p} type="button" onClick={() => void oauth(p)}>{t('cloud.signIn.with', { provider: PROVIDER_LABEL[p] })}</button>
          ))}
        </div>
      )}
      {error && <p id="signin-error" className="error-text" role="alert">{error}</p>}
    </div>
  )
}
