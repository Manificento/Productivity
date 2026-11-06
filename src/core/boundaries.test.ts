import { cruise, type ICruiseResult } from 'dependency-cruiser';
import extractDepcruiseConfig from 'dependency-cruiser/config-utl/extract-depcruise-config';
import { describe, expect, it } from 'vitest';

/** Cruise the given files with the project's real rules (`.dependency-cruiser.cjs`), fixtures included. */
async function violationsOf(files: string[]): Promise<{ rule: string; from: string; to: string }[]> {
  const config = await extractDepcruiseConfig('./.dependency-cruiser.cjs');
  const { output } = await cruise(files, {
    ...config.options,
    exclude: undefined,
    validate: true,
    ruleSet: { forbidden: config.forbidden },
  });
  return (output as ICruiseResult).summary.violations.map((v) => ({ rule: v.rule.name, from: v.from, to: v.to }));
}

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
