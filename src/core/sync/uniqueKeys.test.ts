import { describe, expect, it } from 'vitest';
import { db, TABLE_NAMES } from '../db';
import { UNIQUE_KEYS } from './protocol';

/**
 * Guard of contract #277 (ADR-0012, p. 16): the protocol and the server know every unique index of a synced table
 * besides its primary key. IndexedDB refuses a second live row of such a key, so a pulled row the protocol does
 * not know about would abort the transaction of the pull on every retry.
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

describe('уникальные ключи синхронизируемых таблиц', () => {
  const declared = TABLE_NAMES.flatMap((table) =>
    db
      .table(table)
      .schema.indexes.filter((index) => index.unique)
      .map((index) => ({ table, fields: [index.keyPath ?? []].flat() })),
  );

  it('UNIQUE_KEYS протокола — это уникальные индексы core/db.ts: те же таблицы и те же поля', () => {
    expect(declared.length).toBeGreaterThan(0);
    // One unique key per table is what the protocol and the server resolve.
    expect(new Set(declared.map(({ table }) => table)).size).toBe(declared.length);
    expect(UNIQUE_KEYS).toEqual(Object.fromEntries(declared.map(({ table, fields }) => [table, fields])));
  });

  it('серверная функция sync_unique_key знает каждую такую таблицу и каждое поле её ключа', () => {
    const body = /create function public\.sync_unique_key\([^)]*\)[\s\S]*?\$\$([\s\S]*?)\$\$;/.exec(sql)?.[1] ?? '';
    for (const { table, fields } of declared) {
      const branch = body.split(/\n\s*when /).find((part) => part.includes(`'${table}'`)) ?? '';
      for (const field of fields) expect(branch, `${table}.${field}`).toContain(`'${field}'`);
    }
  });
});
