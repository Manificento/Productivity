import { describe, expect, it } from 'vitest';
import { DELOAD_FACTOR, KCAL_PER_KG, LIGHT_DAY_RPE_LIMIT } from './rules';

// Raw sources of the module files that use the constants (read as text, not imported as code).
const sources = import.meta.glob<string>(
  ['../../modules/nutrition/logic/expenditure.ts', '../../modules/training/logic/periodization.ts'],
  { query: '?raw', import: 'default', eager: true },
);
const source = (path: string) => sources[path] ?? '';

describe('shared adaptation constants', () => {
  it('Given src/core/adaptation/rules.ts When я читаю экспорт Then KCAL_PER_KG, DELOAD_FACTOR (0,6) и порог «лёгкого дня» по RPE экспортированы из ядра; модули импортируют их, собственных копий нет', () => {
    expect(KCAL_PER_KG).toBe(7700);
    expect(DELOAD_FACTOR).toBe(0.6);
    expect(LIGHT_DAY_RPE_LIMIT).toBe(7);

    const expenditure = source('../../modules/nutrition/logic/expenditure.ts');
    const periodization = source('../../modules/training/logic/periodization.ts');
    expect(expenditure).toMatch(
      /import \{[^}]*\bKCAL_PER_KG\b[^}]*\} from '\.\.\/\.\.\/\.\.\/core\/adaptation\/rules'/,
    );
    expect(periodization).toMatch(
      /import \{[^}]*\bDELOAD_FACTOR\b[^}]*\bLIGHT_DAY_RPE_LIMIT\b[^}]*\} from '\.\.\/\.\.\/\.\.\/core\/adaptation\/rules'/,
    );
    // No own copies: neither file declares the constants again.
    expect(expenditure).not.toMatch(/const KCAL_PER_KG\b/);
    expect(periodization).not.toMatch(/const (DELOAD_FACTOR|HARD_RPE|LIGHT_DAY_RPE_LIMIT)\b/);
    expect(expenditure).not.toMatch(/\b7700\b/);
  });
});
