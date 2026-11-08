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
