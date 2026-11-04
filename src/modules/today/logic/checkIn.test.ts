import { describe, expect, it } from 'vitest';
import { parseCheckIn } from './checkIn';

describe('parseCheckIn', () => {
  it('accepts energy and focus from 1 to 5 and trims the note', () => {
    expect(parseCheckIn({ energy: 2, focus: 5, note: '  плохо спал  ' })).toEqual({
      ok: true,
      data: { energy: 2, focus: 5, note: 'плохо спал' },
    });
  });

  it('omits an empty note', () => {
    const r = parseCheckIn({ energy: 3, focus: 3, note: '   ' });
    expect(r).toEqual({ ok: true, data: { energy: 3, focus: 3 } });
  });

  it('asks to rate both energy and focus', () => {
    expect(parseCheckIn({ energy: undefined, focus: 4, note: '' })).toEqual({
      ok: false,
      error: 'Оцените энергию и фокус',
    });
    expect(parseCheckIn({ energy: 6, focus: 4, note: '' }).ok).toBe(false);
    expect(parseCheckIn({ energy: 3, focus: 0, note: '' }).ok).toBe(false);
  });

  it('limits the note length', () => {
    expect(parseCheckIn({ energy: 3, focus: 3, note: 'а'.repeat(501) })).toEqual({
      ok: false,
      error: 'Заметка не длиннее 500 символов',
    });
  });
});
