-- 0001. The server side of the sync: one table per synced table of the app, `sync_push` and `changes_since`.
-- ADR-0009 («Синхронизация», п. 3–5) and ADR-0012. Applied by migrate.sh, once, in one transaction.
--
-- Shape. Every synced table of the app (`TABLE_NAMES` in src/core/db.ts) is a table here with the columns the sync
-- needs — `user_id`, `id`, `rev`, `updated_at`, `updated_by`, `deleted_at` — and the record itself in `data`
-- (jsonb, the row as the device holds it, without its key and sync fields). The tables are the partitions of
-- `sync_rows` by the app's table name, so the two functions below are plain static SQL over one relation, while
-- analytics and backups see ordinary tables (`sleep_logs`, `tasks`, …).
--
-- Access. A signed-in user (`authenticated`) may only SELECT, and row level security shows only the user's own
-- rows. Nobody writes to the tables directly: the only way in is `sync_push`, which takes the user from the token.

create sequence public.sync_rev as bigint;

create table public.sync_rows (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The table's name in the app (camelCase, as in TABLE_NAMES): the partition key and the `table` of the protocol.
  table_name text not null,
  -- Primary key of the record on the device: `id`, or `key` for settings.
  id text not null,
  -- Server sequence: every stored version gets the next number; the cursor of the pull.
  rev bigint not null,
  -- The writer's clock, epoch milliseconds, as on the device; cut to server time when it comes from the future.
  updated_at bigint not null,
  -- `device.id` of the device whose write this is.
  updated_by text not null,
  -- Tombstone: set instead of deleting the row, so the deletion reaches the other devices.
  deleted_at bigint,
  data jsonb,
  -- Server time of the write (the lifetime of a tombstone is counted from here, not from the device's clock).
  received_at timestamptz not null default now(),
  primary key (user_id, table_name, id),
  constraint sync_rows_id_size check (length(id) between 1 and 256),
  constraint sync_rows_updated_by_size check (length(updated_by) between 1 and 128),
  constraint sync_rows_times_not_negative check (updated_at >= 0 and (deleted_at is null or deleted_at >= 0)),
  -- A live row carries its content as an object; a tombstone carries none (what the user deleted is not kept).
  constraint sync_rows_tombstone_has_no_content check (
    case when deleted_at is null then data is not null and jsonb_typeof(data) = 'object' else data is null end
  )
) partition by list (table_name);

create index sync_rows_user_rev on public.sync_rows (user_id, rev);

-- One table per synced table of the app. Adding a table to TABLE_NAMES adds a line here in a new migration
-- (src/core/sync/serverSchema.test.ts fails until it does).
create table public.projects partition of public.sync_rows for values in ('projects');
create table public.tasks partition of public.sync_rows for values in ('tasks');
create table public.habits partition of public.sync_rows for values in ('habits');
create table public.habit_logs partition of public.sync_rows for values in ('habitLogs');
create table public.time_categories partition of public.sync_rows for values in ('timeCategories');
create table public.time_entries partition of public.sync_rows for values in ('timeEntries');
create table public.sleep_logs partition of public.sync_rows for values in ('sleepLogs');
create table public.foods partition of public.sync_rows for values in ('foods');
create table public.meal_logs partition of public.sync_rows for values in ('mealLogs');
create table public.workout_logs partition of public.sync_rows for values in ('workoutLogs');
create table public.check_ins partition of public.sync_rows for values in ('checkIns');
create table public.cognitive_tests partition of public.sync_rows for values in ('cognitiveTests');
create table public.life_events partition of public.sync_rows for values in ('lifeEvents');
create table public.settings partition of public.sync_rows for values in ('settings');
create table public.weight_logs partition of public.sync_rows for values in ('weightLogs');
create table public.programs partition of public.sync_rows for values in ('programs');
create table public.planned_sessions partition of public.sync_rows for values in ('plannedSessions');
create table public.meditation_sessions partition of public.sync_rows for values in ('meditationSessions');
create table public.mind_sessions partition of public.sync_rows for values in ('mindSessions');
create table public.notes partition of public.sync_rows for values in ('notes');
create table public.xp_events partition of public.sync_rows for values in ('xpEvents');

-- Row level security: a user sees only their own rows — through `sync_rows` and through every table directly
-- (a partition queried by its own name is checked by its own policy, not by the parent's). Supabase grants
-- everything on new tables of `public` to the API roles by default; that is taken back first.
do $$
declare
  synced regclass;
begin
  for synced in
    select 'public.sync_rows'::regclass
    union all
    select inhrelid::regclass from pg_catalog.pg_inherits where inhparent = 'public.sync_rows'::regclass
  loop
    execute format('alter table %s enable row level security', synced);
    execute format('revoke all on table %s from public, anon, authenticated', synced);
    execute format('grant select on table %s to authenticated', synced);
    execute format(
      'create policy own_rows on %s for select to authenticated using (user_id = (select auth.uid()))', synced
    );
  end loop;
end
$$;

revoke all on sequence public.sync_rev from public, anon, authenticated;

-- Push (ADR-0009, sync p. 3 and 5). `changes` — a JSON array of
--   { "table", "key", "updatedAt", "updatedBy", "deletedAt"?, "data"? }      (SyncChange in src/core/sync/protocol.ts)
-- `since` — the caller's pull cursor (`lastPulledRev`); `replace` — «replace the data in the cloud» (sync p. 9).
--
-- For every change, in one transaction:
--   1. `updatedAt` (and `deletedAt`) more than 5 minutes ahead of the server's clock is cut to the server's time —
--      not rejected, or the row would be stuck in the device's queue forever;
--   2. last writer wins: the change is stored when its (updatedAt, updatedBy) is not earlier than the stored one;
--   3. a meal (`mealLogs`) written by ANOTHER device after `since` is never overwritten: the caller has not seen
--      that version and must unite the items first (`merge` in protocol.ts) — the server itself merges nothing;
--   4. `replace` stores every change regardless of 2 and 3;
--   5. a stored change gets the next `rev`.
-- Answers one row per change: `applied` and the row as the server now holds it — for a change that was not taken
-- this is the version that won, with its `data`, so the device can resolve the conflict without waiting for a pull.
--
-- SECURITY DEFINER, because users have no write access to the tables: the user is taken from the token
-- (`auth.uid()`), never from the arguments, and `search_path` is empty — every name below is schema-qualified.
create function public.sync_push(changes jsonb, since bigint default 0, replace boolean default false)
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
  server_now bigint;
begin
  if caller is null then
    raise exception 'sync_push: sign in first' using errcode = '28000';
  end if;
  if sync_push.changes is null or jsonb_typeof(sync_push.changes) <> 'array' then
    raise exception 'sync_push: changes must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(sync_push.changes) > 500 then
    raise exception 'sync_push: at most 500 changes per call' using errcode = '22023';
  end if;

  -- One push at a time per user: a user's revs are committed in the order they were assigned, so a pull that runs
  -- next to a push can never move its cursor past a rev that is not visible yet.
  perform pg_advisory_xact_lock(hashtextextended('lifeos.sync:' || caller::text, 0));
  server_now := floor(extract(epoch from clock_timestamp()) * 1000);

  return query
  with incoming as (
    select
      c."table" as table_name,
      c.key as id,
      case when c."updatedAt" > server_now + 300000 then server_now else c."updatedAt" end as updated_at,
      c."updatedBy" as updated_by,
      case when c."deletedAt" > server_now + 300000 then server_now else c."deletedAt" end as deleted_at,
      case when c."deletedAt" is null then c.data end as data
    from jsonb_to_recordset(sync_push.changes)
      as c("table" text, key text, "updatedAt" bigint, "updatedBy" text, "deletedAt" bigint, data jsonb)
  ),
  written as (
    insert into public.sync_rows as stored
      (user_id, table_name, id, rev, updated_at, updated_by, deleted_at, data, received_at)
    select
      caller, i.table_name, i.id, nextval('public.sync_rev'::regclass), i.updated_at, i.updated_by, i.deleted_at,
      i.data, now()
    from incoming i
    on conflict (user_id, table_name, id) do update
      set rev = excluded.rev,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          deleted_at = excluded.deleted_at,
          data = excluded.data,
          received_at = excluded.received_at
      where sync_push.replace
        or (
          (excluded.updated_at, excluded.updated_by collate "C") >= (stored.updated_at, stored.updated_by collate "C")
          and not (
            stored.table_name = 'mealLogs'
            and stored.rev > coalesce(sync_push.since, 0)
            and stored.updated_by <> excluded.updated_by
            and stored.deleted_at is null
            and excluded.deleted_at is null
          )
        )
    returning stored.table_name, stored.id, stored.rev, stored.updated_at, stored.updated_by, stored.deleted_at
  )
  select
    i.table_name,
    i.id,
    coalesce(w.rev, kept.rev),
    coalesce(w.updated_at, kept.updated_at),
    coalesce(w.updated_by, kept.updated_by),
    case when w.rev is null then kept.deleted_at else w.deleted_at end,
    case when w.rev is null then kept.data end,
    w.rev is not null
  from incoming i
  left join written w on w.table_name = i.table_name and w.id = i.id
  -- The rows as they were before this statement: what the server keeps when it does not take a change.
  left join public.sync_rows kept
    on kept.user_id = caller and kept.table_name = i.table_name and kept.id = i.id;
end
$$;

-- Pull (ADR-0009, sync p. 4): the caller's rows with `rev` above the cursor, tombstones included, oldest first,
-- at most `max_rows` (1..1000) — the device asks again from the last `rev` it got until a page comes back short.
-- Runs with the caller's rights: row level security is what limits it to the caller's own rows.
create function public.changes_since(since bigint default 0, max_rows integer default 500)
returns table (
  "table" text,
  key text,
  rev bigint,
  "updatedAt" bigint,
  "updatedBy" text,
  "deletedAt" bigint,
  data jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.table_name, s.id, s.rev, s.updated_at, s.updated_by, s.deleted_at, s.data
  from public.sync_rows s
  where s.user_id = (select auth.uid())
    and s.rev > coalesce(changes_since.since, 0)
  order by s.rev
  limit least(greatest(coalesce(changes_since.max_rows, 500), 1), 1000)
$$;

-- Functions are callable by everyone by default (and Supabase grants them to the API roles): only a signed-in
-- user may call these two.
revoke all on function public.sync_push(jsonb, bigint, boolean) from public, anon, authenticated, service_role;
revoke all on function public.changes_since(bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.sync_push(jsonb, bigint, boolean) to authenticated;
grant execute on function public.changes_since(bigint, integer) to authenticated;
