/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Without it (and the key) the app runs local-only. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable (anon) key. Never put the secret/service_role key in a VITE_ variable. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Optional Cloudflare Turnstile site key for the sign-in form. */
  readonly VITE_TURNSTILE_SITE_KEY?: string
  /** '1' = allow the engine live link (127.0.0.1) in this build's CSP and show its panel. Off for normal production builds. */
  readonly VITE_ENGINE_BRIDGE?: string
}
