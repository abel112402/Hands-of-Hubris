# Hosting and Backend Setup Guide

**Companion to:** [ACCOUNTS_COLLABORATION_GENRE_PLAN.md](ACCOUNTS_COLLABORATION_GENRE_PLAN.md) §10
**Stack:** Supabase (Postgres + Auth + RLS) · Cloudflare Pages · Cloudflare Turnstile · Brevo SMTP · GitHub Actions
**Strategy:** build and test entirely on **free tiers**, then switch to paid production with configuration changes only.

> Free-tier limits and dashboard menu names change often. Numbers here are approximate as of late 2026. Check each provider's pricing page before relying on them.

---

## 0. Environments

| Environment | Purpose | Backend | Frontend | Email | Cost |
| --- | --- | --- | --- | --- | --- |
| **Local** | Daily development, automated tests | Supabase CLI stack in Docker | `npm run dev` (localhost:5173) | Mailpit (local inbox, nothing really sent) | Free |
| **Staging** | Test with real devices/friends | Supabase **Free** project, Frankfurt | Cloudflare Pages preview + `*.pages.dev` | Brevo free (or Supabase default for team-only testing) | Free |
| **Production** | Public users | Supabase **Pro** project, Frankfurt, separate org | Cloudflare Pages production + custom domain | Brevo/Resend with your own domain | ~$25/mo + domain |

Rules:
- Staging and production are **separate Supabase projects**. Never point test builds at production data.
- The same SQL migrations (in git) are applied to every environment. Don't edit schemas by clicking in the dashboard.
- The free Supabase project pauses after about 7 days without activity. Resume it from the dashboard when you need it. That's fine for testing; it's the main reason production must be Pro.

Accounts you need: GitHub (you have it), [Supabase](https://supabase.com), [Cloudflare](https://dash.cloudflare.com), [Brevo](https://www.brevo.com). Optional: Google Cloud Console and GitHub OAuth apps for social login, and Sentry for production.

---

## 1. Secrets hygiene (do this first)

Vite exposes **every** `VITE_*` variable to the browser bundle. Only two values from Supabase may ever be `VITE_*`: the project URL and the **publishable** key (`sb_publishable_…`; older projects call it the `anon` key). The **secret** key (`sb_secret_…` / `service_role`) and the database password must never appear in client code, `VITE_*` variables or git.

The repo `.gitignore` ignores the app's `.env*.local` files and the Supabase CLI temp folder. Make sure these lines exist in the root `.gitignore`:

```gitignore
/game-design-planner-app/.env*.local
/game-design-planner-app/supabase/.temp/
/game-design-planner-app/supabase/.branches/
```

Commit a template instead, `game-design-planner-app/.env.example`:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_TURNSTILE_SITE_KEY=
```

---

## 2. Local Supabase stack (already set up in the repo)

Prerequisites: Docker Desktop running and Node 22. The `supabase` CLI is a dev dependency; `supabase/config.toml` is committed (auth URLs for ports 5173/5175, email rate limit raised for local testing, storage/analytics/edge runtime disabled).

**Windows path workaround.** The Supabase CLI (v3) fails on paths with non-ASCII characters (e.g. `C:\Users\Ábel\…`). Create an ASCII junction once and run every CLI command through it:

```powershell
New-Item -ItemType Junction -Path C:\hoh-planner -Target "<full path to>\game-design-planner-app"
```

```bash
cd /c/hoh-planner && npx supabase start
```

`start` applies `supabase/migrations/*.sql` and prints:

- **API URL** `http://127.0.0.1:54321` → `VITE_SUPABASE_URL`
- **Publishable key** → `VITE_SUPABASE_PUBLISHABLE_KEY`
- **Secret key** → only for `.env.cloudtest.local` (tests), never a `VITE_` variable
- **Studio** `http://127.0.0.1:54323` (database UI)
- **Mailpit** `http://127.0.0.1:54324`, where every auth e-mail sent locally lands

Env files (all git-ignored):

| File | Loaded by | Contents |
| --- | --- | --- |
| `.env.development.local` | `npm run dev` only | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` of the local stack |
| `.env.cloudtest.local` | `npm run test:cloud` only | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` of the local stack |

Unit tests and production builds never read these files, so `npm test` and `npm run build` stay local-only unless the host sets `VITE_*` variables. `.env.example` documents the variables.

Useful commands (from `C:\hoh-planner`): `npx supabase stop`, `npx supabase db reset` (rebuilds the local database from the migrations; safe locally), `npx supabase status`.

---

## 3. Database (implemented: `supabase/migrations/20261108000000_projects.sql`)

Do not edit schemas in the dashboard; add a new migration file instead (`npx supabase migration new <name>` from the junction path) and apply it with `db reset` locally / `db push` remotely.

What the migration contains:

- **Tables:** `profiles`, `projects` (portable payload as JSONB with a 2 MB check; `name`/`genres` are derived copies; `revision`, `last_save_id`, soft delete), `project_members` (one owner per project enforced by a partial unique index), `project_invites` (normalized e-mail, 14-day expiry), `project_revisions`.
- **RLS on every table.** Reads require membership (`project_role_of`, a `SECURITY DEFINER` helper with an empty `search_path`). Owners may change non-owner roles (only the `role` column is writable) and remove members; any non-owner may leave. Anonymous visitors have no table access, and direct inserts/updates on projects are revoked.
- **Functions (signed-in users only):** `list_my_projects`, `create_project` (quota 20 owned projects), `save_project` (compare-and-swap on `revision`; a retry with the same `save_id` reports `saved`; snapshots keep the latest 50), `delete_project` (owner, soft delete), `list_project_members`, `invite_member` (owner, 20 per day per inviter, 20 pending per project, never reveals whether an account exists), `claim_invites` (verified matching e-mail only, single use), `transfer_ownership` (to an existing member; exactly one owner throughout).

Still to add later (M5): permanent purge of soft-deleted projects after 30 days (`pg_cron`), account deletion, invite e-mails sent by the server (see §7).

---

## 4. App integration (implemented)

| Piece | File |
| --- | --- |
| Backend contract (swappable, faked in tests) | `src/core/cloud/backend.ts` |
| Supabase implementation (PKCE, error mapping) | `src/core/cloud/supabaseBackend.ts` |
| Env config; Supabase loads lazily, so local-only builds never download it | `src/core/cloud/config.ts` |
| Project session: auth state, open/close, compare-and-swap save loop, retries, conflicts, per-account drafts | `src/core/cloud/session.ts` |
| Read-only mode for viewers (`mutate`, undo/redo and hint prefs become no-ops) | `src/core/store/store.ts` |
| Routes and guards: `#/welcome`, `#/projects`, `#/projects/:id[/doc/:docId \| /settings]`, `#/project` | `src/App.tsx`, `src/ui/cloud/*` |

Behavior worth knowing:

- **Local mode stays.** With no `VITE_SUPABASE_*` values the app behaves exactly as before. With them, visitors choose "Sign in" or "Use without an account" (remembered per device).
- **Sign-in** is a magic link plus GitHub/Google buttons. Buttons appear only for providers enabled on the server. After the redirect, `?code=` is exchanged and removed, and the user returns to the remembered route. A magic link must be opened in the same browser that requested it (PKCE).
- **Saving:** every edit is debounced (1.5 s) and saved with its base revision. A stale save shows a conflict banner (download mine / load theirs with an automatic snapshot / save mine as a new project / overwrite after a fresh revision check). Offline saves retry with the same save ID. Losing access stops saving and keeps the local copy.
- **Recovery:** unsaved cloud edits are kept in IndexedDB per account and project. After a reload they are restored, or opened as a conflict if the server moved on. Sign-out deletes that account's cached drafts and snapshots on the device.
- **Migration:** the project list offers to upload the legacy browser autosave as a **new** project (the original stays), and to import any `*.hohplan.json`. Cloud loads use the same Zod/migration path as file imports.
- **`#/doc/...` links:** these work in local mode. With cloud enabled and no workspace chosen, they go through the landing page and keep their destination.

---

## 5. CSP and security headers (implemented)

`vite.config.ts` builds the production CSP from the build's env: the Supabase origin is added to `connect-src`, and when `VITE_TURNSTILE_SITE_KEY` is set, `https://challenges.cloudflare.com` is allowed in `script-src`/`frame-src`. `ALLOWED_HOSTS` (AI providers) is unchanged. `public/_headers` sets `frame-ancestors`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and HSTS on Cloudflare Pages.

---

## 6. Staging backend (Supabase Free)

1. Supabase dashboard → **New organization** (Free plan) → **New project** `hoh-staging`, region **Central EU (Frankfurt)**, generate a strong DB password and store it in your password manager.
2. Link and push the migrations:
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref <staging-ref>
   ```
   ```bash
   npx supabase db push
   ```
3. **Authentication → URL Configuration:**
   - Site URL: `https://<your-pages-project>.pages.dev`
   - Redirect URLs: `http://localhost:5173/**`, `https://<your-pages-project>.pages.dev/**`, `https://*.<your-pages-project>.pages.dev/**` (branch previews)
4. **Authentication → Sign In / Providers:** enable **Email** with "Confirm email" on. Your UI offers magic link only; a password option is not shown.
5. **Project Settings → API Keys:** copy the project URL and **publishable** key for Cloudflare (step 8).

### Social login (optional, free)

The callback URL for both is `https://<staging-ref>.supabase.co/auth/v1/callback`.

- **GitHub:** GitHub → Settings → Developer settings → OAuth Apps → New. Homepage = your Pages URL; callback = the URL above. Paste the Client ID and secret into Supabase → Providers → GitHub.
- **Google:** Google Cloud Console → APIs & Services → OAuth consent screen (External; app name, support email, privacy policy URL once you have one) → Credentials → OAuth client ID (Web). Add the callback URL above as an *authorized redirect URI*. Paste the values into Supabase → Providers → Google.

Use separate OAuth apps for staging and production.

---

## 7. Email (magic links and invites)

- **Local:** nothing to do; open Mailpit at `http://127.0.0.1:54324`.
- **Staging, just you:** Supabase's built-in email works, but it is heavily rate-limited (a few per hour) and only delivers to members of your Supabase organization.
- **Staging with testers / production:** use **Brevo** (free ~300 emails/day, EU company).
  1. Brevo → Senders, Domains & Dedicated IPs → add a sender. With your own domain, authenticate it (SPF, DKIM and DMARC DNS records). Without a domain, a single verified sender address works for testing but often lands in spam.
  2. Brevo → SMTP & API → SMTP tab → generate an SMTP key.
  3. Supabase → Authentication → **SMTP Settings** → enable custom SMTP: host `smtp-relay.brevo.com`, port `587`, user = your Brevo login, password = SMTP key, sender = the verified address.
  4. Supabase → Authentication → Rate Limits: raise the email limit to match your Brevo plan.
  5. Supabase → Authentication → Email Templates: edit the Magic Link template (English plus Hungarian text). Keep `{{ .ConfirmationURL }}`.

**Invitations:** v1 does not send invite e-mails. The owner adds the address in *Members & history*, the app shows a link to send, and the invite is attached when that person signs in with the same verified address. Sending invite e-mails needs a small server function (Supabase Edge Function + Brevo API); that is planned for later.

For production, buy a domain (~€10–15/year, e.g. Cloudflare Registrar at cost). Then send from `no-reply@yourdomain` with full SPF, DKIM and DMARC.

---

## 8. Frontend hosting (Cloudflare Pages)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → select `abel112402/Hands-of-Hubris`. If the dashboard steers you to "Workers with static assets", that works too, and `_headers` is supported there as well.
2. Build settings:
   - Framework preset: **None** (or Vite)
   - Root directory: `game-design-planner-app`
   - Build command: `npm ci && npm run build`
   - Output directory: `dist`
3. **Environment variables** (Settings → Variables), set separately for **Production** and **Preview**:
   - `NODE_VERSION` = `22`
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (staging values for Preview; production values later for Production)
   - `VITE_TURNSTILE_SITE_KEY`
4. Every push to `main` deploys production; every other branch gets a preview URL. Add the preview wildcard to Supabase redirect URLs (step 6.3).
5. After the first deploy, check the headers:
   ```bash
   curl -sI https://<your-pages-project>.pages.dev
   ```

Until production exists, point **both** Pages environments at the staging Supabase project.

---

## 9. Bot protection (Cloudflare Turnstile, free)

1. Cloudflare → **Turnstile → Add widget**. Hostnames: `localhost`, `<your-pages-project>.pages.dev`, and your domain later. Mode: Managed.
2. Put the **site key** in `VITE_TURNSTILE_SITE_KEY` (Pages env). Put the **secret key** in Supabase → Authentication → **Attack Protection → CAPTCHA** (provider Turnstile).
3. Render the widget on the sign-in page and pass its token as `captchaToken` (already implemented in `src/ui/cloud/SignInForm.tsx`; the widget appears only when `VITE_TURNSTILE_SITE_KEY` is set, and the CSP from step 5 allows it then).
4. Local development: leave CAPTCHA off in `config.toml`. If you need the widget on screen, Cloudflare's documented always-pass test site key is `1x00000000000000000000AA`.

---

## 10. Tests

| Command | Needs | Covers |
| --- | --- | --- |
| `npm test` | nothing | Everything else, plus the cloud session (`tests/cloudSession.test.ts`) and cloud UI (`tests/cloudUi.test.tsx`) against an in-memory fake backend (`tests/helpers/fakeCloud.ts`): CAS saves, retries, conflicts and their resolutions, viewer read-only, revoked access, project-switch isolation, draft recovery, sign-out cache clearing, landing/sign-in, project list, invites. |
| `npm run test:cloud` | local stack running + `.env.cloudtest.local` | `tests/cloud/rls.test.ts`: authorization through the real API with real users per role. Strangers and anonymous users are isolated; direct table writes are denied; the 2 MB limit; invites are owner-only and claimed only by the matching verified e-mail, single use; CAS and idempotent retries; viewer/editor limits; owner protections; immediate revocation; leaving; ownership transfer keeps exactly one owner; delete; quota. |

Not yet automated: Playwright E2E with two browser sessions (planned for M5). Magic-link sign-in, upload of a local project, saving, a forced conflict and the invite flow were checked by hand against the local stack.

---

## 11. Backups

- **Testing:** not needed; staging holds test data only. Never put real user data in a free project.
- **Production:** Supabase Pro includes daily backups. Also run your own encrypted dump. Put the workflow at the **repo root** `.github/workflows/db-backup.yml`. Encrypt before uploading: workflow artifacts may be readable by anyone with read access to the repo.

```yaml
name: db-backup
on:
  schedule: [{ cron: '0 3 * * *' }]
  workflow_dispatch:
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: |
          supabase db dump --db-url "$DB_URL" -f schema.sql
          supabase db dump --db-url "$DB_URL" --data-only -f data.sql
          sudo apt-get install -y age
          tar czf - schema.sql data.sql | age -r "$AGE_RECIPIENT" > backup-$(date +%F).tar.gz.age
        env:
          DB_URL: ${{ secrets.PROD_DB_URL }}          # session pooler connection string
          AGE_RECIPIENT: ${{ secrets.AGE_PUBLIC_KEY }} # private key stays offline with you
      - uses: actions/upload-artifact@v4
        with: { name: db-backup, path: 'backup-*.age', retention-days: 14 }
```

Practise a restore into the local stack before launch: decrypt, then `psql` the dump into `npx supabase start`.

---

## 12. Free testing → production checklist

| Item | Testing (free) | Production |
| --- | --- | --- |
| Supabase | Free org, `hoh-staging`, pauses when idle | **New Pro org**, `hoh-prod` (Frankfurt), spend cap **on**, `db push` the same migrations |
| Supabase limits (approx.) | 500 MB DB, 50k MAU, 2 free projects | 8 GB DB, 100k MAU included, daily backups |
| Frontend | `*.pages.dev`, Preview + Production → staging DB | Custom domain on Pages; Production env vars → prod Supabase |
| Auth URLs | localhost + pages.dev | Add `https://yourdomain/**`; Site URL = domain |
| OAuth apps | Staging apps | Separate prod apps; Google consent screen published with privacy-policy URL |
| Email | Mailpit / Brevo test sender | Brevo/Resend with authenticated domain |
| Turnstile | Widget with localhost + pages.dev | Add domain to the widget hostnames |
| Monitoring | Browser console | Sentry (EU region, PII scrubbing, no payloads/AI keys), uptime check, Cloudflare Web Analytics |
| Backups | None | Pro daily + encrypted GitHub Action; restore tested |
| Legal | — | ToS, Privacy Policy, impresszum, account deletion, sub-processor list, Supabase DPA signed |

**Recommended first milestone:** steps 1–4 against the local stack only (sign in via Mailpit, create and save a project, force a conflict). Do Cloudflare, Brevo and Turnstile once that works.
