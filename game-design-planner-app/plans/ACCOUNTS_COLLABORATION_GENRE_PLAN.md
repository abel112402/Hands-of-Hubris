# Accounts, Shared Projects and Genre Guidance Plan

**Status:** Proposed (reviewed 2026-11-08, see §10) | **Scope:** Future hosted version of Game Design Planner

> **Review summary:** Technically sound and security-aware, but overscoped for a small team. Genre guidance (M4) has no backend dependency and should ship first in the current local app. The accounts/cloud part is feasible with a managed backend (Supabase recommended, §10) if v1 is trimmed: passwordless auth, owner/editor/viewer enforced in one place, whole-project saves with compare-and-swap. Concrete corrections are in §10.

## 1. Outcome and working decisions

Visitors see a public landing page describing the app, with sign-in and registration. After signing in, they see their own and shared projects, can create or open a project, and can invite teammates. Project creation supports multiple game genres, such as Survival + RPG. The project workspace highlights relevant editors and offers a tailored planning guide.

This plan is a proposal, not a description of existing functionality. Confirm hosting, budget, identity provider and privacy requirements before implementation. Recommended first release:

- Hosted web app with a managed relational database and a managed authentication service. Choose the provider after evaluating deployment region, cost, backups, data portability, and authentication and authorization capabilities; do not make a frontend-only database connection the security boundary.
- Shared projects with role-based access and revision-checked saves. Do not promise simultaneous real-time co-editing in the first release; conflicts are detected and users can recover their work. Real-time presence and merging are a separate future milestone.
- Genre recommendations are editable suggestions, not hard restrictions. All existing editors and project data remain accessible; selecting or changing genres never deletes data.
- Keep JSON import/export and local recovery. Cloud synchronization is not a guarantee of full offline editing; clearly surface offline and unsaved states.

## 2. Current app and integration points

- `src/App.tsx` uses `HashRouter` and places the current planner menu and editor routes under `AppShell`. `src/ui/pages/Home.tsx` is a planner menu, not a public landing page or project list.
- `src/core/model/project.ts` creates one project, seeded by default, with no server identity. `src/core/store/store.ts` holds one active project, its dirty flag and Immer undo/redo history. `src/ui/AppShell.tsx` debounces autosave.
- `src/core/persistence/autosave.ts` currently uses one IndexedDB autosave key and one global list of up to ten snapshots. File imports/exports use `serialize.ts`; format version 1 and `MIGRATIONS` govern the project file. Keep stable module/document IDs and exports.
- `src/core/modules/registry.ts` exposes registered modules and creates missing documents. Module guides use `src/core/guides/types.ts`; project onboarding hints currently use the fixed `ONBOARDING_ORDER` in `src/core/hints/rules/project.ts`.
- Existing hint preferences are saved in project metadata, and the store treats them as non-undoable edits. Their ownership must be decided explicitly when a project becomes shared.

## 3. User journeys and routes

Use the existing hash routing initially unless a deployment decision justifies history routing and server fallback configuration. Preserve or redirect existing editor links deliberately.

| Route (hash paths) | Behavior |
| --- | --- |
| `/` | Public landing page with an app description, relevant visuals, sign-in and registration. Signed-in visitors can navigate directly to their projects. |
| `/login`, `/register`, `/forgot-password` | Accessible authentication flows, validation, verification/reset and clear errors. Handle provider callback routes as required. |
| `/projects` | Authenticated project list, including owned/shared status, name, genres and last update; loading, empty and error states. Create, open and import a project. |
| `/projects/new` | Name plus multi-select genres, including Survival and RPG; allow no selection or Other/custom label, preview recommendations and create the project. |
| `/projects/:projectId` | Open the existing planner menu in the context of the selected project, with recommended editors first and an All editors view. |
| `/projects/:projectId/doc/:docId`, `/definitions`, `/issues`, `/hints`, `/ai` under the project prefix | Existing project workspace functionality with project-aware navigation, loading and permission checks. |
| `/projects/:projectId/members` and `/invites/:token` | Member management and invitation acceptance, gated by role. A signed-out invitee authenticates and returns to the invitation. |

Guard private routes while session state is loading; distinguish signed out, inaccessible/deleted project and network failure. A client route guard is UX only: every server request must independently authorize access. Keep the requested destination through login. Handle old `#/doc/:docId` links by explaining that a project must be selected and offering a project picker; do not silently open or overwrite an unrelated project. Provide a clear local-file import path for existing users.

## 4. Data and security design

### Service boundary

Introduce a typed project repository/service with list, create, read, save, import and membership operations. The browser keeps using the existing store mutation API; a server/API or correctly enforced database row-level policies validate identity, membership, input and revision on **every** operation. A managed authentication service supplies verified user identity; never trust a client-supplied user ID or role. Do not put service-role keys or database credentials in the client. Choose and document the actual provider, endpoint contracts and deployment configuration in an ADR before implementation.

### Suggested relational model

| Record | Key fields and constraints |
| --- | --- |
| User/profile | Auth provider user ID, display name and minimal account metadata; email verification and credentials belong to the auth service. |
| Project | Server-generated ID, name, owner ID, timestamps, monotonically increasing revision, serialized versioned planner payload, and optional soft-deletion timestamp. Project ID is separate from the existing portable file format. |
| Membership | Project ID, user ID, role and membership state; unique `(project_id, user_id)`. Owner is also a member. |
| Invitation | Project ID, normalized intended email, proposed role, inviter, expiry, status and hashed single-use token; no token in logs. |
| Project revision/backup | Project ID, revision, payload or recoverable backup reference, author and timestamp; bounded retention and restore policy. |

Store the existing project payload as JSON/JSONB initially, not a premature relational rewrite of every editor. Validate size and shape on the server, retain unknown data according to the supported compatibility policy, and use the existing versioned serializer/migrations on every file or cloud load. Keep the list name and genres synchronized with the authoritative payload in the same transaction, or derive them from it; specify one source of truth in the implementation ADR. Version cloud storage independently from the portable project format.

### Roles and lifecycle

| Action | Owner | Editor | Viewer |
| --- | --- | --- | --- |
| View, download/export | Yes | Yes | Yes |
| Edit project, genre settings and save | Yes | Yes | No |
| Invite/remove members, change editor/viewer roles | Yes | No | No |
| Delete project, transfer ownership | Yes | No | No |

Enforce these permissions server-side, including revision history and invitation endpoints. Viewers get read-only controls and cannot mutate through alternate API calls. Only the owner can transfer ownership to an existing member; the transaction must retain exactly one owner. Owners cannot remove themselves without transfer or deletion. Define explicit confirmation, recovery/retention periods and a permanent-deletion process before launch. Users can leave shared projects; revocation blocks subsequent reads and writes immediately, including stale sessions and outstanding invitations. A member can export data while authorized, so revocation cannot recall copies already downloaded.

Invitations expire, are revocable and single-use; acceptance requires an authenticated account with the verified intended email. Do not disclose whether an email belongs to an account. Show pending/expired/revoked states and handle duplicate invitations and race conditions transactionally. Send email through an approved service without exposing tokens in telemetry.

Use TLS, secure session storage, secure/HttpOnly/SameSite cookies plus CSRF protection if cookie sessions are chosen, and origin/CORS restrictions. Apply server-side validation, authorization tests, rate limits for authentication/invites, audit events without project contents or secrets, and appropriate security headers/CSP. Preserve existing AI host restrictions and browser-only AI key handling; never put AI provider keys in shared project data, server logs or exports. Establish account deletion, data retention, privacy notice, backup encryption, access controls and restore testing before production.

## 5. Persistence, migration and collaboration

1. Add a project-session layer that owns server project ID, loaded revision, local edit generation, save state and permissions separately from the portable payload. Isolate async requests by project/account; on project switch or sign-out cancel/ignore stale responses and prevent a pending debounce from saving into the wrong project.
2. Read a cloud project through the same validation/migration path as local files. When loading another project, reset undo/redo and project-scoped UI state using the existing store boundary. Preserve unknown data and reject unsupported newer versions for cloud writes unless lossless round-tripping is proven; never silently downgrade a newer file.
3. Keep autosave and snapshots scoped by account and server project ID, with a separate local/legacy namespace. Migrate the current single IndexedDB autosave and snapshot list only after explicit user choice, preserving the originals until a cloud upload is confirmed. On a shared device, prevent a different account from browsing another account's cached projects; provide a clear cache-removal policy on sign-out. Local browser storage is not a security boundary against a person with device access.
4. On first authenticated use, offer to import a `*.hohplan.json`, restore the legacy autosave or start fresh. Preview validation errors and migration warnings, create a **new** cloud project on confirmation, and never overwrite an existing project implicitly. Preserve registry, documents, links, metadata and custom fields. Keep local JSON export and document import/export usable, with round-trip tests.
5. Debounce saves but send a payload with its base revision. Perform an atomic compare-and-swap on the server: accept only the current revision, increment it and return the committed revision; stale writes return a conflict without changing the server. Serialize writes per project, track which local edit generation each response acknowledges, and leave newer edits dirty. Retries after uncertain network outcomes need an idempotency key or equivalent so a committed write is not misreported as a conflict.
6. On conflict, retain the unsaved local draft, fetch the current server version, and present explicit choices: reload server version after backup/export, save the local draft as a new project, or review differences and intentionally overwrite using a fresh revision check. Never auto-merge whole-project JSON or silently discard either version. Re-check permission and revision for every resolution. A failed/offline save remains visibly unsaved and retryable; no background retry may overwrite a newer revision.
7. Undo/redo remains local to the active editor session and must not undo someone else's changes. When replacing the project from the server, clear or explicitly rebase history; do not replay stale Immer patches across revisions. Establish behavior for unsaved work before navigation, reload, sign-out or access revocation, with local recovery/export where permitted. Do not claim real-time collaboration or automatic offline synchronization.

Decide whether hint dismissals, muted rules and thresholds are shared project settings or personal preferences. Proposed split: project-level rule configuration and thresholds remain shared/versioned; dismissal, snooze and personal visibility move to account-local preferences, with an explicit migration that does not erase existing preferences. Document the behavior for imported files and local-only users.

## 6. Genre profiles, editors and custom guides

### Persisted selection and customization

- Add a versioned, optional project profile to the portable schema: stable genre IDs, optional custom labels, user-selected editor overrides and guide/profile version. Keep server membership and account data out of exported files. Extend `Project`, Zod schema, `FORMAT_VERSION`/`MIGRATIONS` as appropriate, and import/export tests; old projects migrate to a neutral profile without losing data.
- Start with a small curated catalog, including `survival` and `rpg`, and a neutral/Other option. Unknown future IDs must be preserved and displayed gracefully. Genres can be changed later by an owner or editor; changing them recalculates recommendations, never deletes documents or resets explicit overrides.
- Provide Recommended and All editors in the planner menu. Users can add/remove recommendations or restore profile defaults; existing data, cross-links, search, exports and deep links must remain usable for non-recommended editors. Do not modify the global module registry or document IDs to hide data.

### Deterministic recommendation model

Define declarative profiles in a dedicated core module: stable genre IDs, display labels, ordered recommended module IDs, rationale and guide contributions. Include a small common foundation such as Vision and Core Loop. For multiple genres, take the union, deduplicate by stable module ID, then order by common foundation followed by profile priority with a deterministic tie-breaker. Apply explicit user overrides last and show why an editor was recommended. Filter missing/retired module IDs safely without discarding the stored profile.

Example: Survival + RPG recommends Vision (`overview.vision`), Core Loop (`design.coreLoop`), Player Character (`design.player`), World & Biomes (`design.world`), Items & Crafting (`design.items`) and other relevant registered modules. These are suggestions, not a complete or mandatory list. Curate the actual mapping against registry IDs and review it with game designers; genre alone does not imply every game needs combat, crafting or any particular mechanic.

### Tailored guide

Build a project-level guide from reusable, declarative steps with stable IDs, genre tags, priority, links to module/section and optional completion predicates. Compose the common foundation with each selected profile, deduplicate shared steps, explain the source of each recommendation and provide links into existing module guides. For Survival + RPG, examples might include defining survival pressures, mapping exploration and progression loops, and connecting character progression with items. Avoid automatically inserting example content or claiming completion solely from genre selection.

Keep existing per-module `ModuleGuide` maps, examples and actions intact; project-level guidance orchestrates them rather than replacing them. Reuse the same computed profile order for relevant onboarding hints, or explicitly label general hints as general, so fixed `ONBOARDING_ORDER` does not contradict the tailored guide. Completion and dismissed state must survive profile changes without marking unrelated steps complete; define which state is project-shared versus personal. Include accessible empty, unknown-genre and no-guide fallbacks. Add matching English/Hungarian UI keys under existing i18n conventions.

## 7. Delivery milestones

Each milestone is independently testable. Scope and rollout depend on the provider/security decisions above.

**Status 2026-11-08 — M-G implemented (local app):** optional `meta.profile` (no format bump; absent = neutral, unknown genres/keys round-trip), catalog in `src/modules/genres.ts` (8 genres + guide steps; adding a genre is data only), pure logic in `src/core/genre.ts` (`recommendEditors`, `composeProjectGuide`, `onboardingOrder`, `projectGenres` for the future cloud `genres` column), reusable `GenrePicker` for a future `/projects/new`, Home Recommended/All views, customization with restore, compact project guide, onboarding hints follow the profile. Decisions: guide completion is derived from project data only (no personal/shared state to migrate later); profile edits are undoable. Tests: `tests/genre.test.ts`, `tests/genreUi.test.tsx`. Open: review the genre→planner mapping with designers.

**Status 2026-11-08 — M0–M3 implemented and tested against the local Supabase stack** (not yet deployed; follow [HOSTING_SETUP_GUIDE.md](HOSTING_SETUP_GUIDE.md) §6–§9 for staging). Decisions: Supabase; local mode kept (no env = exactly the old app); passwordless sign-in (magic link + GitHub/Google); workspace routes unchanged, with `#/projects/:id[/doc/:docId|/settings]` deep links that open a project first; whole-project compare-and-swap saves with save-ID idempotency; viewers read-only via the store; per-account drafts and snapshots, cleared on sign-out; hint preferences stay in the shared project (§10.9); invitations attach on sign-in, with no invite e-mails yet. Code: `supabase/migrations/`, `src/core/cloud/`, `src/ui/cloud/`. Tests: `tests/cloudSession.test.ts`, `tests/cloudUi.test.tsx`, `tests/cloud/rls.test.ts` (`npm run test:cloud`). Remaining for M5: Playwright E2E, invite e-mails (Edge Function), account deletion and purge job, legal pages, monitoring, backups.

**Review correction — order:** do M4 (genres and tailored guidance) first, as "M-G", in the current local-only app. It needs only the portable schema change, has no security surface, and validates the product value before any backend cost. M0–M3 then follow; M5 stays last.

### M0: Decisions and design

- Record an ADR for provider, hosting, identity, authorization enforcement, deployment, cost, retention and threat model; decide the project metadata source of truth and conflict UX.
- Define the portable schema/profile contract, route compatibility, privacy boundaries, and a reviewed role matrix. Agree on supported browsers, accessibility and recovery objectives.
- **Exit:** stakeholders approve decisions and a local-project migration/recovery demonstration plan.

### M1: Accounts and public entry

- Build the landing page and auth pages, provider integration, session handling, route guards and sign-out. Keep the planner workspace available only through the defined project/local import flow.
- Cover registration, verification, login, reset, expired session and return-to-destination. Configure production security headers and deployment callback URLs.
- **Exit:** a new user can register, sign in/out and reach an empty project list; unauthenticated API access is denied.

### M2: Cloud projects and safe local migration

- Add project repository, database schema, owner-only project creation/list/open/rename/delete, versioned cloud saves, revisions and per-project local recovery.
- Implement legacy autosave/snapshot and JSON import/export flows, project switching, save state, compare-and-swap conflicts and revision restore.
- **Exit:** two projects remain isolated across reload, accounts and tabs; legacy data can be imported and exported without loss; a concurrent stale save cannot silently overwrite a newer revision.

### M3: Team sharing

- Add membership and invitation lifecycle, roles, member management, read-only viewer UX, access revocation and ownership transfer. Enforce the matrix for all project and revision endpoints.
- Test duplicate, expired and revoked invitations, unauthorized requests, simultaneous changes and recovery from conflicts.
- **Exit:** an owner invites an editor and viewer, both open the same project with correct permissions, edits persist, and revoked members immediately lose server access.

### M4: Genres and tailored guidance

- Add the portable project profile, genre picker, recommendation engine, customization and tailored project-level guide. Integrate with module navigation and onboarding hints; preserve all editors and existing module guides.
- **Exit:** a Survival + RPG project gets a stable combined recommendation and guide; a user can change genres/overrides without losing data; old and unknown-genre projects remain usable.

### M5: Production hardening and optional expansion

- Exercise backups and restore, monitor save/conflict/auth failures without logging sensitive content, test accessibility/responsive layouts, load/performance and operational recovery; document deployment and rollback.
- Only after product validation, consider presence, activity feed, fine-grained permissions or real-time co-editing. Real-time needs a separate design for merge semantics, undo, reconnect, authorization and data migration; revision-checked whole-project saves alone do not provide it.

## 8. Verification and release gates

- Unit: schema migrations and file round trips (including unknown fields/genres), deterministic recommendation union/overrides, guide step IDs/completion, role decisions and revision/idempotency logic.
- Integration: server-enforced authorization for every role and endpoint, cross-account isolation, invite lifecycle, membership revocation, concurrent compare-and-swap, retries, revision restore and legacy recovery. Test size limits and invalid/newer formats.
- UI: auth and project-list states, project switching with pending saves, viewer read-only behavior, conflict choices, genre selection/changes, guide navigation, hidden-editor discovery, accessibility and matching i18n keys.
- End-to-end: register two users; create/import a project; invite editor and viewer; edit from separate sessions and force a conflict; revoke access; export/reimport; create a Survival + RPG project and open both recommended and other editors.
- Run focused Vitest tests first, then `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`; add browser-based end-to-end checks for the hosted stack. Validate the public landing and project workflows on desktop and mobile.
- Release only after authorization/security review, tested backup restoration, migration rollback, privacy/retention decisions and clear documentation of local recovery and collaboration limits.

## 9. Open decisions

1. Which hosting/auth/database provider, region and budget are acceptable, and is self-hosting required?
2. Is an optional local-only mode required after launch, or is JSON import/export plus local recovery sufficient? The plan preserves file portability but does not assume full offline mode.
3. Are email invitations sufficient, or are team organizations and invite links required? The first release assumes invitations to verified email addresses, not public links.
4. Which genres and guide content should ship initially, and who curates their editor mappings?
5. What are the final account-deletion, project-deletion, revision retention and backup recovery requirements?
6. Should editors manage members, and should hint preferences be personal or shared? The proposed defaults above should be confirmed before implementing the permission and migration contracts.

## 10. Review corrections and recommended stack (2026-11-08)

Checked against the code: `HashRouter` in `src/App.tsx`, single `AUTOSAVE` key and `MAX_SNAPSHOTS = 10` in `autosave.ts`, fixed `ONBOARDING_ORDER`, build-only meta CSP in `vite.config.ts`, AI keys/settings in `localStorage`, Mermaid `securityLevel: 'strict'`. The example projects are 24–30 KB, so whole-project JSON saves are cheap.

### Corrections

1. **Ship genres first** (see §7). Highest value per effort, and it doesn't depend on any backend.
2. **Hash routing + OAuth:** use the auth provider's **PKCE flow** (`?code=` query parameter), not the implicit flow, which returns tokens in the URL fragment and collides with `HashRouter`. Add one non-hash callback (e.g. `/auth/callback` → redirect into `#/projects`).
3. **Passwordless v1:** use magic-link email + Google/GitHub OAuth. This removes `/register` and `/forgot-password`, password reset and credential rate limits. Add passwords later only if users ask for them.
4. **Viewer enforcement in one place:** all edits already go through `useStore.mutate`. In read-only sessions, make `mutate` a no-op that shows a banner, so the 30+ editors don't each need disabled states for v1. Server-side row-level security (RLS) stays the real boundary.
5. **Server validation scope:** Postgres can't run the Zod schemas. On the server, enforce authorization, compare-and-swap (CAS) on the revision, a size cap (2 MB) and `jsonb_typeof = 'object'`. Full schema validation stays on every client load. That is already the real boundary, because imported files are treated as untrusted. Add an Edge Function that reuses Zod only if a server-side consumer of the payload appears.
6. **Idempotency, simplified:** store `last_save_id` (a client UUID) on the project row. If a retry gets a conflict whose server row has that ID, the earlier write committed. No separate idempotency infrastructure is needed.
7. **Revision retention, concrete:** don't write a revision for every debounced autosave. Snapshot at most every 10 min per editor session and before every conflict overwrite or restore. Keep the last 50 plus one per day for 30 days. At ~30 KB each, that is negligible storage.
8. **Invitations, simplified:** v1 can store a pending membership keyed by normalized email. It attaches automatically when a user signs in with that **verified** email, and the invite email is just a link to the app. This avoids the token table, hashing and token leakage concerns. Add tokenized links only if inviting unverified or alias addresses is required.
9. **Hint preferences:** keep them in the project (shared) for v1. The personal/shared split adds a migration for low value. Revisit after real team usage.
10. **CSP and headers:** add the backend origin to `connect-src` (`https://<ref>.supabase.co`, plus `wss://<ref>.supabase.co` if Realtime is used) and keep `ALLOWED_HOSTS` in sync. Meta CSP cannot set `frame-ancestors`, so send CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy` and HSTS as **host HTTP headers**. Auth tokens will now sit in `localStorage` next to AI keys, which makes XSS more costly. Keep `script-src 'self'`, strict Mermaid and no new `dangerouslySetInnerHTML`.
11. **Cheap conflict reduction (optional M3):** Realtime *presence* ("Anna is editing World") costs little and prevents most conflicts. Later, a per-document three-way merge (auto-merge when changed document IDs are disjoint) is a safe middle step before real-time co-editing.
12. **EU/GDPR:** host data in an EU region and sign the provider's DPA. Publish a privacy notice and add self-service account deletion before inviting outside users.

### Recommended stack

Step-by-step setup (free tiers for testing, paid for production): [HOSTING_SETUP_GUIDE.md](HOSTING_SETUP_GUIDE.md).

| Concern | Choice | Notes |
| --- | --- | --- |
| Auth + DB | **Supabase** (Postgres, Auth, RLS), region `eu-central-1` (Frankfurt) | Relational fits members/invites; RLS plus a `save_project(id, base_revision, payload, save_id)` SQL function performs the CAS atomically. JSONB payload. Free tier pauses after ~1 week of inactivity and has no restorable backups. Use Pro (~$25/mo) for real users. |
| Frontend hosting | **Cloudflare Pages** | Free, global, custom headers via `_headers` (needed for CSP/frame-ancestors), preview deploys per branch. Netlify is equivalent; GitHub Pages can't set headers. |
| Transactional email | **Brevo** (EU) or **Resend** as Supabase custom SMTP | Supabase's built-in SMTP is heavily rate-limited and not meant for production. |
| Backups | Provider backups plus a nightly `pg_dump` via GitHub Actions to private storage | Also needed on the free tier; test a restore before launch. |
| Local dev/tests | Supabase CLI (Docker) local stack; RLS tests in Vitest against it (or pgTAP); **Playwright** for E2E | Two-user E2E (owner/editor/viewer, forced conflict) runs against the local stack in CI. |
| Client lib | `@supabase/supabase-js` behind the typed project repository | Keep the repository interface so a local-only implementation (IndexedDB) and the cloud one are interchangeable. |

Alternatives considered: **PocketBase** on a ~€5/mo Hetzner VPS (simple and cheap, but you own ops, backups and TLS); **Firebase** (mature auth, but Firestore is document-oriented and rules-based, and the membership/CAS logic is clumsier); **Convex** (good DX, real-time built in, more lock-in). A custom Node API is not recommended: it adds auth, session and CSRF work for no benefit at this scale.

### Decision: public audience (2026-11-08)

The hosted version is for **public users**, not only an internal team. This resolves open decision 1 in part and adds these release requirements:

- **Abuse controls:** CAPTCHA on sign-in/magic-link requests (Supabase supports Cloudflare Turnstile natively). Per-user quotas: max owned projects (e.g. 20), payload cap 2 MB, max revisions retained. Rate-limit invitations (e.g. 20/day per user, 5 pending per project for a new account) so invite emails can't be used for spam. Invite emails must not include user-controlled free text beyond the project name, and the project name must be length-limited and escaped.
- **Cost safety:** use Supabase Pro with the spend cap on. Cloudflare Pages stays free. AI stays **bring-your-own-key, browser-only**. Never proxy AI calls through the server, because that turns public users into your bill.
- **Legal (EU/Hungary):** Terms of Service, Privacy Policy, provider/contact information (impresszum), self-service account deletion, and data export (the JSON export already covers portability). Minimum age 16 (Hungarian GDPR consent age), or require parental consent. Use only essential storage and cookieless analytics (Cloudflare Web Analytics or Plausible), so no cookie consent banner is needed. List sub-processors (Supabase, Cloudflare, email provider).
- **Operations:** error monitoring with PII scrubbing (Sentry, EU region; never send project payloads or AI keys), uptime check, and a documented incident/contact address. Plan account and project deletion: soft delete, permanent purge after 30 days, and backups expire within their retention window.
- **Abandoned-account handling:** project owner deletes account → transfer prompt if other members exist; otherwise the project is deleted with the account.
- **Content:** projects are private to members, so no public-content moderation is needed in v1. A public project gallery or public share links would require a moderation/reporting design first.
- **Effort impact:** about +2–3 weeks on top of the estimate below, mostly legal pages, quotas, deletion flows and monitoring.

### Effort estimate (one developer, part-time ~10 h/week, AI-assisted)

| Milestone | Estimate | Risk |
| --- | --- | --- |
| Genres + tailored guide (local) | 1.5–2.5 weeks | Low. The main cost is curating content and i18n. |
| M0 + M1 accounts, landing, routing | 1.5–2 weeks | Low–medium (PKCE callback, route guards) |
| M2 cloud projects, CAS saves, legacy migration | 3–4 weeks | **Highest.** Project-session layer, stale-response isolation, conflict UX |
| M3 sharing, roles, invites, revocation | 2–3 weeks | Medium. RLS correctness needs good tests. |
| M5 hardening, backups, privacy, E2E | 1.5–2 weeks | Medium |
| **Total** | **~10–14 weeks part-time** | Plan as written (every gate) is closer to the upper bound. |