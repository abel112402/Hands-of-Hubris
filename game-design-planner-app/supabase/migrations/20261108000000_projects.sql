-- Cloud projects, membership, invitations and revisions (plan M1–M3).
-- Security model: RLS on every table; all writes that need several checks or rows go through
-- SECURITY DEFINER functions with an empty search_path that check auth.uid() themselves.
-- The project payload is the portable *.hohplan.json document; `name`/`genres` are derived copies.

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
  genres text[] not null default '{}' check (cardinality(genres) <= 20),
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
create index projects_owner_idx on public.projects (owner_id);

create table public.project_members (
  project_id uuid not null references public.projects on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role public.project_role not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);
-- Exactly one owner per project.
create unique index project_members_one_owner on public.project_members (project_id) where role = 'owner';

create table public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254 and position('@' in email) > 1),
  role public.project_role not null check (role <> 'owner'),
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  unique (project_id, email)
);
create index project_invites_email_idx on public.project_invites (email);
create index project_invites_inviter_idx on public.project_invites (invited_by, created_at);

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

create policy "own profile read"   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = (select auth.uid()));

-- Projects: read if member. Writes only through the functions below.
create policy "members read projects" on public.projects for select to authenticated
  using (public.project_role_of(id) is not null);

-- Members: read co-members; owner changes non-owner roles; owner removes others; anyone but the owner may leave.
create policy "members read members" on public.project_members for select to authenticated
  using (public.project_role_of(project_id) is not null);
create policy "owner changes roles" on public.project_members for update to authenticated
  using (public.project_role_of(project_id) = 'owner' and role <> 'owner')
  with check (public.project_role_of(project_id) = 'owner' and role <> 'owner');
-- Only the role column may change through the API (no moving memberships between projects/users).
revoke update on public.project_members from authenticated;
grant update (role) on public.project_members to authenticated;
create policy "owner removes or member leaves" on public.project_members for delete to authenticated
  using (role <> 'owner' and (public.project_role_of(project_id) = 'owner' or user_id = (select auth.uid())));

-- Invites: owner reads and revokes; creation goes through invite_member (rate limits).
create policy "owner reads invites" on public.project_invites for select to authenticated
  using (public.project_role_of(project_id) = 'owner');
create policy "owner revokes invites" on public.project_invites for delete to authenticated
  using (public.project_role_of(project_id) = 'owner');

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

-- ---------- Project list for the signed-in user ----------
create or replace function public.list_my_projects()
returns table (id uuid, name text, genres text[], revision bigint, updated_at timestamptz,
               role public.project_role, owner_email text, member_count bigint)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.genres, p.revision, p.updated_at, m.role,
         (select u.email::text from auth.users u where u.id = p.owner_id),
         (select count(*) from public.project_members x where x.project_id = p.id)
  from public.projects p
  join public.project_members m on m.project_id = p.id and m.user_id = auth.uid()
  where p.deleted_at is null
  order by p.updated_at desc
$$;

-- ---------- Create project (atomic: project + owner membership + first revision) ----------
create or replace function public.create_project(p_name text, p_genres text[], p_payload jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if (select count(*) from public.projects where owner_id = auth.uid() and deleted_at is null) >= 20 then
    raise exception 'project quota reached' using errcode = 'P0001', hint = 'quota';
  end if;
  insert into public.projects (name, genres, owner_id, payload, updated_by)
    values (left(coalesce(nullif(trim(p_name), ''), 'Untitled'), 120), coalesce(p_genres, '{}'), auth.uid(), p_payload, auth.uid())
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
     set payload = p_payload, name = left(coalesce(nullif(trim(p_name), ''), 'Untitled'), 120),
         genres = coalesce(p_genres, '{}'), revision = revision + 1, last_save_id = p_save_id,
         updated_by = auth.uid(), updated_at = now()
   where id = p_id and revision = p_base_revision and deleted_at is null
   returning revision into v_rev;

  if found then
    if p_snapshot then
      insert into public.project_revisions (project_id, revision, payload, author_id)
        values (p_id, v_rev, p_payload, auth.uid());
      delete from public.project_revisions r
       where r.project_id = p_id
         and r.revision not in (select x.revision from public.project_revisions x
                                where x.project_id = p_id order by x.revision desc limit 50);
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
  delete from public.project_invites where project_id = p_id;
end $$;

-- ---------- Members with e-mail (only for co-members) ----------
create or replace function public.list_project_members(p_id uuid)
returns table (user_id uuid, email text, display_name text, role public.project_role, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.project_role_of(p_id) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select m.user_id, u.email::text, pr.display_name, m.role, m.created_at
    from public.project_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles pr on pr.id = m.user_id
    where m.project_id = p_id
    order by m.role desc, u.email;
end $$;

-- ---------- Invite by e-mail (owner only, rate-limited) ----------
-- Never reveals whether the address has an account: the invite is claimed at that user's next sign-in.
create or replace function public.invite_member(p_id uuid, p_email text, p_role public.project_role)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_email text := lower(trim(p_email)); v_id uuid;
begin
  if public.project_role_of(p_id) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role = 'owner' then raise exception 'use transfer_ownership' using errcode = '22023'; end if;
  if (select count(*) from public.project_invites where invited_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'invite rate limit' using errcode = 'P0001', hint = 'rate';
  end if;
  if (select count(*) from public.project_invites where project_id = p_id) >= 20 then
    raise exception 'too many pending invites' using errcode = 'P0001', hint = 'pending';
  end if;
  insert into public.project_invites (project_id, email, role, invited_by)
    values (p_id, v_email, p_role, auth.uid())
  on conflict (project_id, email) do update
    set role = excluded.role, invited_by = excluded.invited_by,
        created_at = now(), expires_at = now() + interval '14 days'
  returning id into v_id;
  return v_id;
end $$;

-- ---------- Claim pending invites for the signed-in, verified e-mail ----------
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
     join public.projects p on p.id = i.project_id and p.deleted_at is null
     where i.email = v_email and i.expires_at > now()
  on conflict (project_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from public.project_invites where email = v_email;
  return n;
end $$;

-- ---------- Ownership transfer (owner → existing member) ----------
create or replace function public.transfer_ownership(p_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if public.project_role_of(p_id) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_new_owner = auth.uid() then return; end if;
  if not exists (select 1 from public.project_members where project_id = p_id and user_id = p_new_owner) then
    raise exception 'not a member' using errcode = '22023';
  end if;
  -- Demote first so the one-owner unique index holds at every step.
  update public.project_members set role = 'editor' where project_id = p_id and user_id = auth.uid();
  update public.project_members set role = 'owner' where project_id = p_id and user_id = p_new_owner;
  update public.projects set owner_id = p_new_owner where id = p_id;
end $$;

-- ---------- Table permissions: nothing for anonymous visitors; no direct inserts ----------
revoke all on all tables in schema public from anon;
revoke insert on public.projects, public.project_members, public.project_invites, public.project_revisions from authenticated;
revoke update on public.projects, public.project_invites, public.project_revisions from authenticated;
revoke delete on public.projects, public.project_revisions from authenticated;

-- ---------- Function permissions: signed-in users only ----------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.project_role_of(uuid),
  public.list_my_projects(),
  public.create_project(text, text[], jsonb),
  public.save_project(uuid, bigint, jsonb, text, text[], uuid, boolean),
  public.delete_project(uuid),
  public.list_project_members(uuid),
  public.invite_member(uuid, text, public.project_role),
  public.claim_invites(),
  public.transfer_ownership(uuid, uuid)
to authenticated;
-- Future functions are not executable by anon/public unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon;
