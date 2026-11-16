-- 0002. The account (issue #278; ADR-0009, «Следствия для дизайна» p. 2, 6, 9 and «Удаление»): the region of this
-- deployment, a profile per user, the consent journal, the age rule on every push, account deletion.
-- Applied by migrate.sh, once, in one transaction; migrate.sh gives the deployment's REGION as `lifeos.region`.
--
-- Access, as in 0001: everything new tables get by default is taken back from the API roles first; a signed-in
-- user (`authenticated`) reads only their own rows (row level security) and writes only what is said here.

-- ---------------------------------------------------------------------------------------------------------------
-- The cell. A database belongs to ONE region for good (ADR-0009, owner decision 7): every region is a separate
-- deployment with its own Postgres and Auth. The region is written here when this migration is applied and never
-- changes; migrate.sh refuses to work on a database of another region (a copy restored into the wrong cell).
-- ---------------------------------------------------------------------------------------------------------------
create table public.lifeos_cell (
  only_row boolean primary key default true check (only_row),
  region text not null check (region ~ '^[a-z]{2}$')
);

insert into public.lifeos_cell (region) values (current_setting('lifeos.region'));

alter table public.lifeos_cell enable row level security;
revoke all on table public.lifeos_cell from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Profiles: one row per user, created with the account. `region` is the cell the account was created in — the
-- client reaches the user's data through the backend of that region only (`backendFor` in src/core/sync/config.ts).
-- The user reads their own profile and cannot change it: a region changes only by an explicit move of the user
-- between cells, which is the operator's work, not an API call.
-- ---------------------------------------------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  region text not null check (region ~ '^[a-z]{2}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated, service_role;
grant select on table public.profiles to authenticated;
create policy own_profile on public.profiles for select to authenticated using (user_id = (select auth.uid()));

-- Accounts that exist already (a test stack; no server has users yet) get their profile now.
insert into public.profiles (user_id, region)
select u.id, c.region from auth.users u cross join public.lifeos_cell c;

-- The profile is written by the database itself when Auth creates the user — no client call can forget it or
-- choose another region. Auth's own role runs the trigger, so the function has the rights of its owner.
create function public.create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, region)
  select new.id, c.region from public.lifeos_cell c;
  if not found then
    raise exception 'create_profile: this database has no region (public.lifeos_cell is empty)';
  end if;
  return new;
end
$$;

create trigger lifeos_create_profile
  after insert on auth.users
  for each row execute function public.create_profile();

-- ---------------------------------------------------------------------------------------------------------------
-- The consent journal (ADR-0009, design p. 2): append-only. Giving a consent and taking it back are both NEW rows;
-- no row is ever changed or removed (only together with the whole account, `delete_account`). The consent in
-- force is the last row of its kind (the greatest `id`).
--
--   cloud         the cloud copy and the sync of the user's data
--   cloud_health  health data inside that copy (HEALTH_TABLES in src/core/sync/healthData.ts) — separate and
--                 explicit (GDPR art. 9, WA MHMDA)
--   analytics     first-party analytics and models on pseudonymised data
--   third_party   any transfer to a third party
--   age           the user confirmed the age the cloud account needs; `details.rule` is the rule it was confirmed
--                 by — `16+` (16 or older), `kz18+` (Kazakhstan, 18 or older), `kz_guardian` (Kazakhstan, 16–17
--                 with the consent of a legal representative). The year of birth is never sent to the server.
--
-- `text_version` — the version of the text the user saw. `created_at` and `user_id` are the server's: the user
-- has INSERT on the other four columns only, and the trigger below sets both whatever was sent.
-- ---------------------------------------------------------------------------------------------------------------
create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  granted boolean not null,
  text_version text not null,
  details jsonb,
  created_at timestamptz not null default now(),
  constraint consents_kind check (kind in ('cloud', 'cloud_health', 'analytics', 'third_party', 'age')),
  constraint consents_text_version_size check (length(text_version) between 1 and 64),
  constraint consents_details_is_small_object check (
    details is null or (jsonb_typeof(details) = 'object' and length(details::text) <= 2000)
  )
);

-- The last row of a kind is read on every push and on every new consent.
create index consents_user_kind on public.consents (user_id, kind, id desc);

alter table public.consents enable row level security;
revoke all on table public.consents from public, anon, authenticated, service_role;
grant select on table public.consents to authenticated;
grant insert (kind, granted, text_version, details) on table public.consents to authenticated;
create policy own_consents on public.consents for select to authenticated using (user_id = (select auth.uid()));
create policy add_own_consent on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()));
-- No policy and no grant for UPDATE or DELETE: a row of the journal cannot be changed or removed through the API.

-- Whether a consent is in force: the last row of its kind says «granted». Called by the functions below only.
create function public.consent_in_force(user_id uuid, kind text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select c.granted
    from public.consents c
    where c.user_id = consent_in_force.user_id and c.kind = consent_in_force.kind
    order by c.id desc
    limit 1
  ), false)
$$;

-- Every new row of the journal, whoever writes it:
--   - belongs to the user of the token and carries the server's time;
--   - a confirmation of age names the rule it was confirmed by;
--   - THE AGE COMES FIRST (ADR-0009, design p. 6: 16+, in Kazakhstan 18+ or with a legal representative): while no
--     confirmation of age is in force, no other consent can be given. The client checks this too — here it does
--     not depend on the client. Taking a consent back is always possible.
create function public.consents_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller constant uuid := auth.uid();
begin
  if caller is null then
    raise exception 'consents: sign in first' using errcode = '28000';
  end if;
  new.user_id := caller;
  new.created_at := now();
  if new.kind = 'age' then
    if new.granted and coalesce(new.details ->> 'rule', '') not in ('16+', 'kz18+', 'kz_guardian') then
      raise exception 'consents: the age is confirmed by a rule — details.rule is 16+, kz18+ or kz_guardian'
        using errcode = '22023';
    end if;
  elsif new.granted and not public.consent_in_force(caller, 'age') then
    raise exception 'consents: confirm the age first' using errcode = '42501', detail = 'age_required';
  end if;
  return new;
end
$$;

create trigger consents_before_insert
  before insert on public.consents
  for each row execute function public.consents_before_insert();

-- ---------------------------------------------------------------------------------------------------------------
-- Push. `sync_push` of 0001 becomes two functions:
--   sync_apply — the rules by which changes are stored (ADR-0012), exactly as they were in 0001;
--   sync_push  — the gate the API calls: who may send data at all. The next contracts (health data without the
--                `cloud_health` consent — #279, the free plan — #280) add their conditions to the gate and leave
--                the rules alone.
-- ---------------------------------------------------------------------------------------------------------------

-- The body of `sync_push` of 0001, unchanged but for the name its parameters are qualified with. It runs with the
-- rights of its only caller, `sync_push` (the tables' owner): no API role may execute it.
create function public.sync_apply(changes jsonb, since bigint default 0, replace boolean default false)
returns table (
  "table" text,
  key text,
  rev bigint,
  "updatedAt" bigint,
  "updatedBy" text,
  "deletedAt" bigint,
  data jsonb,
  applied boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller constant uuid := auth.uid();
  server_now bigint;
  -- `ord` of the changes that are stored, and of those the last round of rule 4 has refused.
  taken bigint[];
  refused bigint[];
begin
  if caller is null then
    raise exception 'sync_push: sign in first' using errcode = '28000';
  end if;
  if sync_apply.changes is null or jsonb_typeof(sync_apply.changes) <> 'array' then
    raise exception 'sync_push: changes must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(sync_apply.changes) > 500 then
    raise exception 'sync_push: at most 500 changes per call' using errcode = '22023';
  end if;

  -- One push at a time per user: a user's revs are committed in the order they were assigned, so a pull that runs
  -- next to a push can never move its cursor past a rev that is not visible yet. It also makes the rows read
  -- below the rows the changes are written over.
  perform pg_advisory_xact_lock(hashtextextended('lifeos.sync:' || caller::text, 0));
  server_now := floor(extract(epoch from clock_timestamp()) * 1000);

  -- A change that is not stored is not checked by the table's constraints: what they would say of it is said here.
  if exists (
    select 1
    from public.sync_incoming(sync_apply.changes, server_now) i
    where i.table_name is null or i.id is null or i.updated_at is null or i.updated_by is null
      or (i.deleted_at is null and coalesce(jsonb_typeof(i.data), 'null') <> 'object')
  ) then
    raise exception 'sync_push: a change needs table, key, updatedAt, updatedBy and deletedAt or data (an object)'
      using errcode = '22023';
  end if;

  -- Rules 2 and 3 (and 5).
  select coalesce(array_agg(i.ord), '{}')
  into taken
  from public.sync_incoming(sync_apply.changes, server_now) i
  left join public.sync_rows stored
    on stored.user_id = caller and stored.table_name = i.table_name and stored.id = i.id
  where sync_apply.replace
    or stored.id is null
    or (
      (i.updated_at, i.updated_by collate "C") >= (stored.updated_at, stored.updated_by collate "C")
      and not (
        stored.table_name = 'mealLogs'
        and stored.rev > coalesce(sync_apply.since, 0)
        and stored.updated_by <> i.updated_by
        and stored.deleted_at is null
      )
    );

  -- Rule 4: a row whose change is refused stays where it is, and that may be the key of another change.
  while not sync_apply.replace loop
    with incoming as materialized (
      select c.ord, c.table_name, c.id, c.unique_key
      from public.sync_incoming(sync_apply.changes, server_now) c
      where c.ord = any (taken)
    )
    select array_agg(i.ord)
    into refused
    from incoming i
    where i.unique_key is not null
      and (
        exists (
          select 1
          from incoming other
          where other.table_name = i.table_name and other.id <> i.id and other.unique_key = i.unique_key
        )
        or exists (
          select 1
          from public.sync_rows held
          where held.user_id = caller
            and held.table_name = i.table_name
            and held.id <> i.id
            and held.deleted_at is null
            and public.sync_unique_key(held.table_name, held.data) = i.unique_key
            and not exists (
              select 1 from incoming moved where moved.table_name = held.table_name and moved.id = held.id
            )
        )
      );
    exit when refused is null;
    taken := array(select t.ord from unnest(taken) as t(ord) where t.ord <> all (refused));
  end loop;

  return query
  with incoming as materialized (
    select c.ord, c.table_name, c.id, c.updated_at, c.updated_by, c.deleted_at, c.data
    from public.sync_incoming(sync_apply.changes, server_now) c
  ),
  written as (
    insert into public.sync_rows as stored
      (user_id, table_name, id, rev, updated_at, updated_by, deleted_at, data, received_at)
    select
      caller, i.table_name, i.id, nextval('public.sync_rev'::regclass), i.updated_at, i.updated_by, i.deleted_at,
      i.data, now()
    from (select * from incoming c where c.ord = any (taken) order by c.ord) i
    on conflict (user_id, table_name, id) do update
      set rev = excluded.rev,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          deleted_at = excluded.deleted_at,
          data = excluded.data,
          received_at = excluded.received_at
    returning stored.table_name, stored.id, stored.rev, stored.updated_at, stored.updated_by, stored.deleted_at
  )
  select
    i.table_name,
    i.id,
    coalesce(w.rev, kept.rev, 0),
    coalesce(w.updated_at, kept.updated_at, i.updated_at),
    coalesce(w.updated_by, kept.updated_by, i.updated_by),
    case when w.rev is null then kept.deleted_at else w.deleted_at end,
    case when w.rev is null then kept.data end,
    w.rev is not null
  from incoming i
  left join written w on w.table_name = i.table_name and w.id = i.id
  -- The rows as they were before this statement: what the server keeps when it does not take a change. A change
  -- of rule 4 for a row the server has never stored has none: it is answered with `rev` 0 and no content.
  left join public.sync_rows kept
    on kept.user_id = caller and kept.table_name = i.table_name and kept.id = i.id
  order by i.ord;
end
$$;

-- The gate: a signed-in user whose confirmation of age is in force (ADR-0009, design p. 6). Without it the server
-- takes no data, whatever the client thinks — the request is refused as a whole and nothing is stored.
--
-- SECURITY DEFINER, because users have no write access to the tables: the user is taken from the token
-- (`auth.uid()`), never from the arguments, and `search_path` is empty.
create or replace function public.sync_push(changes jsonb, since bigint default 0, replace boolean default false)
returns table (
  "table" text,
  key text,
  rev bigint,
  "updatedAt" bigint,
  "updatedBy" text,
  "deletedAt" bigint,
  data jsonb,
  applied boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller constant uuid := auth.uid();
begin
  if caller is null then
    raise exception 'sync_push: sign in first' using errcode = '28000';
  end if;
  if not public.consent_in_force(caller, 'age') then
    raise exception 'sync_push: confirm the age first' using errcode = '42501', detail = 'age_required';
  end if;
  return query select * from public.sync_apply(sync_push.changes, sync_push.since, sync_push.replace);
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Account deletion (ADR-0009, «Удаление»; Google Play: deletion from inside the app). Removes everything the
-- database holds of the CALLER — the rows of every data table, the consent journal, the profile, the Auth user
-- with its sessions, and what Auth keeps about the user without a foreign key (its audit log, the states of
-- unfinished sign-ins) — in one transaction. It takes no arguments: the user is the one of the token, nobody else
-- can be named. What is on the user's devices is not the server's to remove and stays there. Backups made before
-- the deletion leave with their rotation (backup.sh keeps BACKUP_KEEP daily copies).
-- ---------------------------------------------------------------------------------------------------------------
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller constant uuid := auth.uid();
  address text;
begin
  if caller is null then
    raise exception 'delete_account: sign in first' using errcode = '28000';
  end if;
  -- The lock of `sync_apply`: a push of the same user that is running now finishes first, and one that comes
  -- after finds no user to write for.
  perform pg_advisory_xact_lock(hashtextextended('lifeos.sync:' || caller::text, 0));
  delete from public.sync_rows where user_id = caller;
  delete from public.consents where user_id = caller;
  delete from public.profiles where user_id = caller;
  -- Auth's own tables (sessions, refresh tokens, identities, one-time codes) go with the user…
  select u.email into address from auth.users u where u.id = caller;
  delete from auth.users where id = caller;
  -- …except two that have no foreign key to the user. Auth's audit log has a row for every sign-in, with the
  -- user's id and e-mail in its JSON payload (and the client's address next to it); `flow_state` keeps the PKCE
  -- state of every sign-in by letter. Left alone, both would keep the address of a deleted account for good — and
  -- put it into every new backup.
  delete from auth.flow_state where user_id = caller;
  delete from auth.audit_log_entries entry
  where entry.payload ->> 'actor_id' = caller::text
    or entry.payload ->> 'actor_username' = address
    or entry.payload -> 'traits' ->> 'user_id' = caller::text
    or entry.payload -> 'traits' ->> 'user_email' = address;
end
$$;

-- Functions are callable by everyone by default (and Supabase grants them to the API roles): only a signed-in
-- user may call `sync_push` (granted in 0001) and `delete_account`; the others are called by the database itself.
revoke all on function public.create_profile() from public, anon, authenticated, service_role;
revoke all on function public.consent_in_force(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.consents_before_insert() from public, anon, authenticated, service_role;
revoke all on function public.sync_apply(jsonb, bigint, boolean) from public, anon, authenticated, service_role;
revoke all on function public.delete_account() from public, anon, authenticated, service_role;
grant execute on function public.delete_account() to authenticated;
