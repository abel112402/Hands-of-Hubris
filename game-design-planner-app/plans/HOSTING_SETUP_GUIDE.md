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

## 2. Local Supabase stack

Prerequisites: Docker Desktop running (you have Docker 28) and Node 22.

```bash
cd game-design-planner-app
npm install -D supabase
npx supabase init
npx supabase start
```

`init` creates `supabase/config.toml` and `supabase/migrations/`. `start` prints:

- **API URL** `http://127.0.0.1:54321` → `VITE_SUPABASE_URL`
- **Publishable key** → `VITE_SUPABASE_PUBLISHABLE_KEY`
- **Studio** `http://127.0.0.1:54323` (database UI)
- **Mailpit** `http://127.0.0.1:54324`, where every auth email sent locally lands

Put the two values in `game-design-planner-app/.env.local`.

In `supabase/config.toml`, set the auth URLs for the Vite dev server:

```toml
[auth]
site_url = "http://localhost:5173"
additional_redirect_urls = ["http://localhost:5173/**", "http://127.0.0.1:5173/**"]

[auth.email]
enable_signup = true
# local only: lets tests sign in test users with a password
enable_confirmations = false
```

Useful commands:

```bash
npx supabase stop
```

```bash
npx supabase db reset
```

`db reset` rebuilds the local database from `supabase/migrations/` and is safe to run anytime locally.

---

## 3. Database schema, RLS and save function

Create the first migration:

```bash
npx supabase migration new init_projects
```

Paste the following into the generated `supabase/migrations/<timestamp>_init_projects.sql`, then run `npx supabase db reset`.

```sql
-- ---------- Types and tables ----------
create type public.project_role as enum ('viewer', 'editor', 'owner'); -- order matters: viewer < editor < owner

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  genres text[] not null default '{}' check (cardinality(genres) <= 10),
  owner_id uuid not null references auth.users on delete cascade,
  revision bigint not null default 1,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2097152  -- 2 MB
  ),
  last_save_id uuid,
  updated_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.projects (owner_id);

create table public.project_members (
  project_id uuid not null references public.projects on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role public.project_role not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index on public.project_members (user_id);

create table public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  role public.project_role not null check (role <> 'owner'),
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  unique (project_id, email)
);

create table public.project_revisions (
  project_id uuid not null references public.projects on delete cascade,
  revision bigint not null,
  payload jsonb not null,
  author_id uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, revision)
);

-- ---------- Helper: caller's role in a project (null = no access) ----------
-- SECURITY DEFINER bypasses RLS inside, which avoids policy recursion.
create or replace function public.project_role_of(p_project uuid)
returns public.project_role
language sql stable security definer set search_path = ''
as $$
  select m.role
  from public.project_members m
  join public.projects p on p.id = m.project_id
  where m.project_id = p_project
    and m.user_id = auth.uid()
    and p.deleted_at is null
$$;

-- ---------- Row-level security ----------
alter table public.profiles          enable row level security;
alter table public.projects          enable row level security;
alter table public.project_members   enable row level security;
alter table public.project_invites   enable row level security;
alter table public.project_revisions enable row level security;

create policy "own profile read"   on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
-- (Add a policy for reading co-members' display names when the member list UI needs it.)

-- Projects: read if member. All writes go through the functions below (no insert/update/delete policies).
create policy "members read projects" on public.projects for select to authenticated
  using (public.project_role_of(id) is not null);

create policy "members read members" on public.project_members for select to authenticated
  using (public.project_role_of(project_id) is not null);
create policy "owner adds members" on public.project_members for insert to authenticated
  with check (public.project_role_of(project_id) = 'owner' and role <> 'owner');
create policy "owner changes roles" on public.project_members for update to authenticated
  using (public.project_role_of(project_id) = 'owner' and role <> 'owner')
  with check (role <> 'owner');
create policy "owner removes or member leaves" on public.project_members for delete to authenticated
  using (role <> 'owner' and (public.project_role_of(project_id) = 'owner' or user_id = auth.uid()));

create policy "owner manages invites" on public.project_invites for all to authenticated
  using (public.project_role_of(project_id) = 'owner')
  with check (public.project_role_of(project_id) = 'owner' and role <> 'owner');

create policy "members read revisions" on public.project_revisions for select to authenticated
  using (public.project_role_of(project_id) is not null);

-- ---------- Profile row on sign-up ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Create project (atomic: project + owner membership + first revision) ----------
create or replace function public.create_project(p_name text, p_genres text[], p_payload jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if (select count(*) from public.projects where owner_id = auth.uid() and deleted_at is null) >= 20 then
    raise exception 'project quota reached' using errcode = 'P0001';
  end if;
  insert into public.projects (name, genres, owner_id, payload, updated_by)
    values (p_name, coalesce(p_genres, '{}'), auth.uid(), p_payload, auth.uid())
    returning id into v_id;
  insert into public.project_members (project_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into public.project_revisions (project_id, revision, payload, author_id)
    values (v_id, 1, p_payload, auth.uid());
  return v_id;
end $$;

-- ---------- Save with compare-and-swap ----------
-- Returns {"status":"saved"|"conflict","revision":n}. A retry of an already-committed
-- save (same p_save_id) is reported as "saved", not as a conflict.
create or replace function public.save_project(
  p_id uuid, p_base_revision bigint, p_payload jsonb,
  p_name text, p_genres text[], p_save_id uuid, p_snapshot boolean default false
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_role public.project_role; v_rev bigint; v_last uuid;
begin
  v_role := public.project_role_of(p_id);
  if v_role is null or v_role < 'editor' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.projects
     set payload = p_payload, name = p_name, genres = coalesce(p_genres, '{}'),
         revision = revision + 1, last_save_id = p_save_id,
         updated_by = auth.uid(), updated_at = now()
   where id = p_id and revision = p_base_revision and deleted_at is null
   returning revision into v_rev;

  if found then
    if p_snapshot then
      insert into public.project_revisions (project_id, revision, payload, author_id)
        values (p_id, v_rev, p_payload, auth.uid());
      delete from public.project_revisions r
       where r.project_id = p_id
         and r.revision not in (select revision from public.project_revisions
                                where project_id = p_id order by revision desc limit 50);
    end if;
    return jsonb_build_object('status', 'saved', 'revision', v_rev);
  end if;

  select p.revision, p.last_save_id into v_rev, v_last from public.projects p where p.id = p_id;
  return jsonb_build_object(
    'status', case when v_last = p_save_id then 'saved' else 'conflict' end,
    'revision', v_rev);
end $$;

-- ---------- Soft delete (owner only) ----------
create or replace function public.delete_project(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if public.project_role_of(p_id) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.projects set deleted_at = now() where id = p_id;
end $$;

-- ---------- Claim pending invites for the signed-in, verified email ----------
create or replace function public.claim_invites()
returns int language plpgsql security definer set search_path = ''
as $$
declare v_email text; n int;
begin
  select lower(u.email) into v_email from auth.users u
   where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  insert into public.project_members (project_id, user_id, role)
    select i.project_id, auth.uid(), i.role from public.project_invites i
     where i.email = v_email and i.expires_at > now()
  on conflict (project_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from public.project_invites where email = v_email;
  return n;
end $$;

-- ---------- Function permissions: signed-in users only ----------
revoke execute on function public.project_role_of(uuid), public.create_project(text, text[], jsonb),
  public.save_project(uuid, bigint, jsonb, text, text[], uuid, boolean),
  public.delete_project(uuid), public.claim_invites() from public, anon;
grant execute on function public.project_role_of(uuid), public.create_project(text, text[], jsonb),
  public.save_project(uuid, bigint, jsonb, text, text[], uuid, boolean),
  public.delete_project(uuid), public.claim_invites() to authenticated;
```

Still to add in later migrations (see plan M3/M5): ownership transfer, invite rate limits (count rows per `invited_by` per day in an `invite_member` function, and drop the direct insert policy), permanent purge of soft-deleted projects after 30 days (`pg_cron`), and account deletion.

After `db reset`, run Supabase's built-in security checks locally (Studio → Advisors). They flag tables without RLS and functions with mutable `search_path`.

---

## 4. Connect the React app

```bash
npm install @supabase/supabase-js
```

**Env typing:** create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
```

**Client:** `src/core/cloud/supabase.ts`. The app keeps working local-only when the variables are missing:

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const cloudEnabled = Boolean(url && key)

export const supabase = cloudEnabled
  ? createClient(url!, key!, {
      auth: {
        flowType: 'pkce',          // returns ?code=… (query), not tokens in the #hash (HashRouter-safe)
        detectSessionInUrl: true,  // exchanges ?code automatically on load
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
```

**Sign-in.** Remember where the user was going before leaving the app:

```ts
const redirectTo = `${location.origin}${location.pathname}` // no hash: the code arrives as ?code=

export async function signInWithEmail(email: string, captchaToken?: string) {
  sessionStorage.setItem('hoh.returnTo', location.hash || '#/projects')
  return supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, captchaToken } })
}

export async function signInWithProvider(provider: 'google' | 'github') {
  sessionStorage.setItem('hoh.returnTo', location.hash || '#/projects')
  return supabase!.auth.signInWithOAuth({ provider, options: { redirectTo } })
}
```

**After the redirect** (for example, in a small `AuthProvider` near `App`), remove `?code` from the address bar, return to the saved route, and claim invites:

```ts
supabase?.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') {
    const back = sessionStorage.getItem('hoh.returnTo')
    sessionStorage.removeItem('hoh.returnTo')
    history.replaceState(null, '', location.pathname + (back ?? location.hash))
    void supabase!.rpc('claim_invites')
  }
})
```

PKCE caveat: a magic link must be opened **in the same browser** that requested it, because the code verifier lives there. Say so on the "check your email" screen.

**Repository** (`src/core/cloud/projectRepository.ts`). Every load goes through the existing validation and migration path:

```ts
import { deserializeProject } from '../persistence/serialize'
import { projectGenres } from '../genre'
import type { Project } from '../model/types'
import { supabase } from './supabase'

// The portable payload (`meta.name`, `meta.profile.genres`) is the single source of truth.
// The `name`/`genres` columns are derived copies for the project list, written in the same call.

export type SaveResult = { status: 'saved' | 'conflict'; revision: number }

export async function listProjects() {
  const { data, error } = await supabase!
    .from('projects')
    .select('id, name, genres, owner_id, revision, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function loadProject(id: string) {
  const { data, error } = await supabase!.from('projects').select('payload, revision').eq('id', id).single()
  if (error) throw error
  // Same untrusted-data path as file import: Zod + migrations + warnings.
  const { project, warnings } = deserializeProject(JSON.stringify(data.payload))
  return { project, warnings, revision: data.revision as number }
}

export async function createProject(project: Project) {
  const { data, error } = await supabase!.rpc('create_project', {
    p_name: project.meta.name, p_genres: projectGenres(project), p_payload: project,
  })
  if (error) throw error
  return data as string
}

export async function saveProject(
  id: string, baseRevision: number, project: Project, saveId: string, snapshot = false,
): Promise<SaveResult> {
  const { data, error } = await supabase!.rpc('save_project', {
    p_id: id, p_base_revision: baseRevision, p_payload: project,
    p_name: project.meta.name, p_genres: projectGenres(project), p_save_id: saveId, p_snapshot: snapshot,
  })
  if (error) throw error
  return data as SaveResult
}
```

Use `crypto.randomUUID()` for `saveId`, and **reuse the same ID when retrying** the same save after a network error.

**Typed queries (optional, recommended):** generate types from the schema so `.from('projects')` is type-checked:

```bash
npx supabase gen types typescript --local > src/core/cloud/database.types.ts
```

---

## 5. CSP and security headers

The production CSP in `vite.config.ts` currently blocks Supabase. Build it from the env so each environment allows only its own backend. `ALLOWED_HOSTS` in `src/core/ai/security.ts` is for AI providers only; **don't** add Supabase there.

```ts
import { defineConfig, loadEnv, type Plugin } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const supabaseOrigin = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : ''
  const turnstile = env.VITE_TURNSTILE_SITE_KEY ? 'https://challenges.cloudflare.com' : ''
  const CSP = [
    "default-src 'self'",
    `script-src 'self' ${turnstile}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com ${supabaseOrigin}`,
    `frame-src ${turnstile || "'none'"}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
  // …existing cspPlugin using CSP, plugins, test config…
})
```

Headers a `<meta>` CSP cannot set go in `game-design-planner-app/public/_headers`. Vite copies `public/` into `dist/`, and Cloudflare Pages applies the file:

```
/*
  Content-Security-Policy: frame-ancestors 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
```

The browser enforces both policies (meta plus header), so this header CSP only needs `frame-ancestors`.

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
  5. Supabase → Authentication → Email Templates: edit the Magic Link and Invite templates (English plus Hungarian text). Keep `{{ .ConfirmationURL }}`.

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
3. Render the widget on the sign-in page and pass its token as `captchaToken` (see `signInWithEmail` above). You can load `https://challenges.cloudflare.com/turnstile/v0/api.js` or use a small wrapper package. The CSP from step 5 already allows it.
4. Local development: leave CAPTCHA off in `config.toml`. If you need the widget on screen, Cloudflare's documented always-pass test site key is `1x00000000000000000000AA`.

---

## 10. Tests against the local stack

**RLS/authorization (Vitest):** create test users with the local **secret** key, which is test code only and never in `src/`. Then act as each user with the publishable key:

```ts
// tests/cloud/rls.test.ts — run with the local stack started; skip when not available
import { createClient } from '@supabase/supabase-js'
const URL = 'http://127.0.0.1:54321'
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!)          // from `npx supabase status`
const asUser = async (email: string) => {
  await admin.auth.admin.createUser({ email, password: 'test-password-1', email_confirm: true })
  const c = createClient(URL, process.env.SUPABASE_PUBLISHABLE_KEY!)
  await c.auth.signInWithPassword({ email, password: 'test-password-1' })
  return c
}
// it('stranger cannot read or save another user\'s project', async () => { … expect(error.code).toBe('42501') })
```

Cover at least these cases: stranger read/save is denied; viewer save is denied; editor save is OK; a stale `base_revision` gives a conflict; a retry with the same `save_id` gives saved; a revoked member loses access immediately; an invite is claimed only with a verified, matching email.

Keep these out of the default `npm test` run (separate script, e.g. `"test:cloud": "vitest run tests/cloud"`) so the normal suite doesn't need Docker.

**End-to-end (Playwright):** `npm i -D @playwright/test`. Sign in test users the same way (the password exists on local only). Run two browser contexts (owner and editor) and force a conflict. Run E2E in GitHub Actions with `supabase/setup-cli` and `supabase start`.

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
