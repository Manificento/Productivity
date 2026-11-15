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

/** The expression a method is called on: walks left from the dot over names, dots, calls and line breaks. */
function receiverOf(source: string, dot: number): string {
  let depth = 0;
  let i = dot - 1;
  for (; i >= 0; i -= 1) {
    const ch = source[i]!;
    if (ch === ')' || ch === ']') depth += 1;
    else if (depth > 0) depth -= ch === '(' || ch === '[' ? 1 : 0;
    else if (!/[\w$.\s?!]/.test(ch)) break;
  }
  return source.slice(i + 1, dot);
}

/** Physical deletes on a Dexie table or collection: `db.x.delete(…)`, `.bulkDelete(…)`, `.clear()`, `db.x.where(…)….delete()`. */
function physicalDeletes(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/\.\s*(delete|bulkDelete|clear)\s*\(/g)) {
    const receiver = receiverOf(source, match.index);
    if (/(^|[^\w$.])db\s*\./.test(receiver) || /\.table\s*\(/.test(receiver)) {
      const line = source.slice(0, match.index).split('\n').length;
      found.push(`line ${line}: ${receiver.trim().replace(/\s+/g, '')}.${match[1]}(…)`);
    }
  }
  return found;
}

describe('contract #274: физическое удаление заменено на softDelete', () => {
  it('детектор находит физическое удаление в таблице Dexie и не путает его с Set/Map и softDelete', () => {
    expect(physicalDeletes('await db.tasks.delete(id);')).toHaveLength(1);
    expect(physicalDeletes('if (stale.length > 0) await db.habitLogs.bulkDelete(stale);')).toHaveLength(1);
    expect(physicalDeletes('await Promise.all([db.tasks.clear(), db.projects.clear()]);')).toHaveLength(2);
    expect(physicalDeletes('await db.table(name).clear();')).toHaveLength(1);
    expect(physicalDeletes('const rows = await tx.table("notes").where("id").equals(id).delete();')).toHaveLength(1);
    expect(
      physicalDeletes(
        "await db.plannedSessions\n  .where('programId')\n  .equals(id)\n  .filter((s) => s.date > today && s.status === 'planned')\n  .delete();",
      ),
    ).toEqual([expect.stringContaining('line 5')]);

    expect(physicalDeletes('return () => listeners.delete(listener);')).toEqual([]);
    expect(physicalDeletes('if (next.has(name)) next.delete(name);')).toEqual([]);
    expect(physicalDeletes('sessionCache.clear();')).toEqual([]);
    expect(physicalDeletes('await softDelete(db.tasks, id);')).toEqual([]);
    expect(physicalDeletes('await softDeleteMany(db.habitLogs, stale);')).toEqual([]);
    expect(physicalDeletes('await db.tasks.put(task); cache.delete(task.id);')).toEqual([]);
  });

  it('Given npm run check When прогоняется Then физическое delete в модулях заменено на softDelete (grep-тест по исходникам модулей и core/logging)', () => {
    const checked = Object.keys(sources).filter((path) => !isTestFile(path));
    // The glob really sees the code: every module with a data layer and the shared write paths.
    expect(checked.length).toBeGreaterThan(100);
    expect(checked).toContain('../modules/tasks/data/tasks.ts');
    expect(checked).toContain('./logging/sleep.ts');

    const violations = checked.flatMap((path) => physicalDeletes(sources[path]!).map((found) => `${path} — ${found}`));
    expect(violations, 'удаляй записи через softDelete() / softDeleteMany() из src/core/db.ts').toEqual([]);
  });
});
