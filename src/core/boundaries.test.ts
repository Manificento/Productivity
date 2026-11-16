import { cruise, type ICruiseResult } from 'dependency-cruiser';
import extractDepcruiseConfig from 'dependency-cruiser/config-utl/extract-depcruise-config';
import { describe, expect, it } from 'vitest';

/**
 * Cruise the given files with the project's real rules (`.dependency-cruiser.cjs`), fixtures included.
 * `baseDir` — a fixture folder cruised as if it were the project root, for rules bound to a path under `src/`;
 * an absolute path (with a relative one the fixture's imports do not resolve to node_modules).
 */
async function violationsOf(files: string[], baseDir?: string): Promise<{ rule: string; from: string; to: string }[]> {
  const config = await extractDepcruiseConfig('./.dependency-cruiser.cjs');
  const { output } = await cruise(files, {
    ...config.options,
    exclude: undefined,
    validate: true,
    ruleSet: { forbidden: config.forbidden },
    ...(baseDir && { baseDir, tsConfig: undefined }),
  });
  return (output as ICruiseResult).summary.violations.map((v) => ({ rule: v.rule.name, from: v.from, to: v.to }));
}

describe('npm run deps: протокол синхронизации — чистые функции', () => {
  it('правило logic-is-pure расширено на src/core/sync/: файл протокола с импортом Dexie → ошибка границ', async () => {
    // The absolute path of this test file gives the absolute path of the fixture (no `node:path` types here).
    const fixtureRoot = String(expect.getState().testPath).replace(/core\/[^/]+$/, 'test/fixtures/syncPurity');
    const violations = await violationsOf(['src/core/sync/impureProtocol.ts'], fixtureRoot);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'logic-is-pure', from: 'src/core/sync/impureProtocol.ts' }),
    );
  }, 20_000);

  it('src/core/sync/ проходит правило: протокол и транспорт без React и Dexie, Dexie — только в middleware и миграции', async () => {
    const violations = await violationsOf(['src/core/sync']);
    expect(violations).toEqual([]);
  }, 20_000);
});

describe('npm run deps: границы платформы', () => {
  it('модуль импортирует @capacitor/* напрямую → ошибка границ', async () => {
    const violations = await violationsOf(['src/test/fixtures/modules/tasks/directCapacitorImport.ts']);
    expect(violations).toContainEqual(
      expect.objectContaining({
        rule: 'native-only-through-platform',
        from: 'src/test/fixtures/modules/tasks/directCapacitorImport.ts',
      }),
    );
  }, 20_000);

  it('src/core/platform.ts импортирует Capacitor без ошибки', async () => {
    const violations = await violationsOf(['src/core/platform.ts']);
    expect(violations).toEqual([]);
  }, 20_000);
});
