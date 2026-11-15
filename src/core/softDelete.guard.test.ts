import { describe, expect, it } from 'vitest';

/**
 * Guard of contract #274: records are deleted with `softDelete()` / `softDeleteMany()` from `core/db.ts`, never
 * physically — a physical delete leaves no tombstone, so the sync could not carry the deletion to other devices.
 *
 * The sources are read as text (not imported). Checked: every module and the shared write paths of
 * `core/logging/`. Not checked: tests and test helpers (they reset tables with `clear()`), and the core itself
 * (`backup.ts` replaces all data, the middlewares remove tombstones).
 */
const sources = import.meta.glob<string>(['../modules/**/*.{ts,tsx}', './logging/**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const isTestFile = (path: string): boolean => /\.test\.tsx?$|\/testing\.tsx?$/.test(path);

/**
 * The expression a method is called on, read right to left from its dot: a chain of `name`, `name(…)`, `name[…]`
 * and `(…)` links joined by dots (the chain may be broken over lines). It stops at anything else — a keyword, an
 * operator, the `)` of an `if (…)` in front of the statement.
 */
function receiverOf(source: string, dot: number): string {
  const before = (at: number): string => source[at - 1] ?? '';
  let i = dot;
  for (;;) {
    while (/\s/.test(before(i))) i -= 1;
    while (/[!?]/.test(before(i))) i -= 1;
    while (/[)\]]/.test(before(i))) {
      let depth = 0;
      do {
        i -= 1;
        if (/[)\]]/.test(source[i]!)) depth += 1;
        else if (/[([]/.test(source[i]!)) depth -= 1;
      } while (i > 0 && depth > 0);
    }
    while (/[\w$]/.test(before(i))) i -= 1;
    let link = i;
    while (/\s/.test(before(link))) link -= 1;
    if (before(link) !== '.') break;
    i = link - 1;
  }
  return source.slice(i, dot).replace(/\s+/g, '');
}

/** Built-ins with their own `delete` / `clear`. A receiver the file declares as one of them is not a Dexie table. */
const OWN_DELETE = 'Set|Map|WeakSet|WeakMap|URLSearchParams|Headers|FormData';

/** `const name = new Set(…)`, or a declared type `name: Map<…>` (a parameter, a field), somewhere in the file. */
function isBuiltInCollection(source: string, name: string): boolean {
  if (!/^[\w$]+$/.test(name)) return false;
  const id = name.replace(/\$/g, '\\$');
  const created = new RegExp(`(?<![\\w$.])(?:const|let|var)\\s+${id}\\s*(?::[^=;]+)?=\\s*new\\s+(?:${OWN_DELETE})\\b`);
  const typed = new RegExp(`(?<![\\w$.])${id}\\??\\s*:\\s*(?:Readonly)?(?:${OWN_DELETE})\\b`);
  return created.test(source) || typed.test(source);
}

/**
 * Physical deletes on a Dexie table or collection: `db.x.delete(…)`, `.bulkDelete(…)`, `.clear()`,
 * `db.x.where(…)….delete()` — and the same on a table held in a variable, passed as a parameter or destructured
 * from `db`.
 *
 * The check works by exclusion: every `.delete(` / `.clear(` counts, unless its receiver is a plain name that the
 * same file declares as a Set / Map (`OWN_DELETE`). `.bulkDelete(` exists only in Dexie and always counts.
 */
function physicalDeletes(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/\.\s*(delete|bulkDelete|clear)\s*\(/g)) {
    const receiver = receiverOf(source, match.index);
    if (match[1] === 'bulkDelete' || !isBuiltInCollection(source, receiver)) {
      const line = source.slice(0, match.index).split('\n').length;
      found.push(`line ${line}: ${receiver}.${match[1]}(…)`);
    }
  }
  return found;
}

describe('contract #274: физическое удаление заменено на softDelete', () => {
  it('детектор находит физическое удаление в таблице Dexie и не путает его с Set/Map и softDelete', () => {
    expect(physicalDeletes('await db.tasks.delete(id);')).toEqual(['line 1: db.tasks.delete(…)']);
    expect(physicalDeletes('if (stale.length > 0) await db.habitLogs.bulkDelete(stale);')).toHaveLength(1);
    expect(physicalDeletes('await Promise.all([db.tasks.clear(), db.projects.clear()]);')).toHaveLength(2);
    expect(physicalDeletes('await db.table(name).clear();')).toHaveLength(1);
    expect(physicalDeletes('const rows = await tx.table("notes").where("id").equals(id).delete();')).toHaveLength(1);
    expect(
      physicalDeletes(
        "await db.plannedSessions\n  .where('programId')\n  .equals(id)\n  .filter((s) => s.date > today && s.status === 'planned')\n  .delete();",
      ),
    ).toEqual([expect.stringContaining('line 5: db.plannedSessions.where(')]);

    expect(
      physicalDeletes('const listeners = new Set<() => void>();\nreturn () => listeners.delete(listener);'),
    ).toEqual([]);
    expect(physicalDeletes('const next = new Set(prev);\nif (next.has(name)) next.delete(name);')).toEqual([]);
    expect(physicalDeletes('const sessionCache = new Map<string, Food[]>();\nsessionCache.clear();')).toEqual([]);
    expect(
      physicalDeletes('function forget(cache: Map<string, number>, id: string) {\n  cache.delete(id);\n}'),
    ).toEqual([]);
    expect(physicalDeletes('await softDelete(db.tasks, id);')).toEqual([]);
    expect(physicalDeletes('await softDeleteMany(db.habitLogs, stale);')).toEqual([]);
    expect(physicalDeletes('const cache = new Map();\nawait db.tasks.put(task); cache.delete(task.id);')).toEqual([]);
  });

  it('детектор находит удаление и через таблицу в переменной, в параметре или из деструктуризации db', () => {
    expect(physicalDeletes('const { tasks } = db;\nawait tasks.delete(id);')).toEqual(['line 2: tasks.delete(…)']);
    expect(physicalDeletes('const table = db.tasks;\nawait table.clear();')).toHaveLength(1);
    expect(physicalDeletes("const open = db.tasks.where('done').equals(0);\nawait open.delete();")).toHaveLength(1);
    expect(physicalDeletes("const { tasks } = db;\nawait tasks.where('projectId').equals(id).delete();")).toHaveLength(
      1,
    );
    expect(
      physicalDeletes('async function wipe(table: Table<Task, string>) {\n  await table.clear();\n}'),
    ).toHaveLength(1);
    expect(physicalDeletes('await stale.bulkDelete(ids);')).toHaveLength(1);
    expect(physicalDeletes('const rows = new Map();\nawait rows.bulkDelete(ids);')).toHaveLength(1);
    expect(physicalDeletes('await tx.notes.delete(id);')).toHaveLength(1);
    expect(physicalDeletes('await (await openTable()).delete(id);')).toHaveLength(1);
    expect(physicalDeletes('await tables[0]!.clear();')).toHaveLength(1);
    // A Set / Map counts as one only when this file declares it so: an unknown name is treated as a table.
    expect(physicalDeletes('listeners.delete(listener);')).toHaveLength(1);
    // A name that only ends like a declared collection, or a property with its name, is something else.
    expect(physicalDeletes('const cache = new Map();\nawait taskcache.delete(id);')).toHaveLength(1);
    expect(physicalDeletes('const cache = new Map();\nawait db.cache.delete(id);')).toHaveLength(1);
  });

  it('Given npm run check When прогоняется Then физическое delete в модулях заменено на softDelete (grep-тест по исходникам модулей и core/logging)', () => {
    const checked = Object.keys(sources).filter((path) => !isTestFile(path));
    // The glob really sees the code: every module with a data layer and the shared write paths.
    expect(checked.length).toBeGreaterThan(100);
    expect(checked).toContain('../modules/tasks/data/tasks.ts');
    expect(checked).toContain('./logging/sleep.ts');

    const violations = checked.flatMap((path) => physicalDeletes(sources[path]!).map((found) => `${path} — ${found}`));
    expect(
      violations,
      'удаляй записи через softDelete() / softDeleteMany() из src/core/db.ts; ' +
        'если это Set или Map — объяви его в этом же файле (`const x = new Set()` или тип `x: Map<…>`)',
    ).toEqual([]);
  });
});
