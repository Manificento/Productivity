import { describe, expect, it } from 'vitest';
import { TABLE_NAMES } from '../db';

/**
 * Guard of contract #277: the server schema (`infra/supabase/migrations/`) has a table for every synced table of
 * the app. The migrations are read as text; that they really apply to an empty Postgres, with row level security,
 * is checked in Docker by `infra/supabase/tests/migrations.test.sh` (workflow «Infra»), which runs only when
 * `infra/` changes — this test runs on every change, so a new table in `TABLE_NAMES` cannot be forgotten.
 */
const migrations = import.meta.glob<string>('../../../infra/supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const sql = Object.keys(migrations)
  .toSorted()
  .map((path) => migrations[path])
  .join('\n');

/** `create table public.<server table> partition of public.sync_rows for values in ('<app table>')` */
const serverTables = [
  ...sql.matchAll(/create table public\.(\w+) partition of public\.sync_rows for values in \('(\w+)'\);/g),
].map(([, serverName, appName]) => ({ serverName, appName }));

describe('серверная схема синхронизации', () => {
  it('Given infra/supabase/migrations/ Then созданы таблицы для всех синхронизируемых таблиц ядра (TABLE_NAMES)', () => {
    expect(serverTables.map((table) => table.appName).toSorted()).toEqual([...TABLE_NAMES].toSorted());
  });

  it('серверная таблица названа так же, как таблица приложения, в snake_case', () => {
    for (const { serverName, appName } of serverTables) {
      expect(serverName).toBe(appName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
    }
  });

  it('миграции пронумерованы подряд: NNNN_name.sql, без пропусков и повторов', () => {
    const names = Object.keys(migrations)
      .map((path) => path.split('/').at(-1) ?? '')
      .toSorted();
    expect(names.length).toBeGreaterThan(0);
    names.forEach((name, index) => {
      expect(name).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
      expect(Number(name.slice(0, 4))).toBe(index + 1);
    });
  });

  it('каждая SECURITY DEFINER функция закрепляет search_path', () => {
    const functions = sql.split(/^create (?:or replace )?function /m).slice(1);
    const definers = functions.filter((body) => /^security definer$/m.test(body.split('$$')[0]));
    expect(definers.length).toBeGreaterThan(0);
    for (const body of definers) expect(body.split('$$')[0]).toMatch(/^set search_path = ''$/m);
  });
});
