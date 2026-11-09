import type { CloudBackend } from './backend'

/** Cloud settings from the build environment (see plans/HOSTING_SETUP_GUIDE.md). */
export const cloudConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || '',
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '',
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || '',
}

export const isCloudConfigured = () => !!(cloudConfig.url && cloudConfig.key)

/** Creates the Supabase backend lazily, so local-only builds never load the client library. */
export async function createConfiguredBackend(): Promise<CloudBackend | null> {
  if (!isCloudConfigured()) return null
  const { createSupabaseBackend } = await import('./supabaseBackend')
  return createSupabaseBackend(cloudConfig.url, cloudConfig.key)
}

/** Where auth e-mails and OAuth return to: the app's own page, without the #route (PKCE adds ?code=). */
export const authRedirectUrl = () => `${location.origin}${location.pathname}`

/** Only absolute http or https URLs are used, so a bad build value cannot become a javascript: link. */
const httpUrl = (v: string | undefined) => {
  const s = v?.trim() ?? ''
  return /^https?:\/\//i.test(s) && URL.canParse(s) ? s : ''
}

/** Optional legal pages linked from the landing page footer; hidden when not set. */
export const siteLinks = {
  privacy: httpUrl(import.meta.env.VITE_PRIVACY_URL),
  terms: httpUrl(import.meta.env.VITE_TERMS_URL),
}
