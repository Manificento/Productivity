import { describe, expect, it } from 'vitest';
import { newRecord } from '../../../core/ids';
import type { Note } from '../../../core/types';
import { dayTitle, relatedNotes } from './notes';

const n = (id: string, linkIds: string[], updatedAt: number): Note => ({
  ...newRecord({ title: id, body: '', linkIds }, updatedAt),
  id,
});

describe('relatedNotes / dayTitle', () => {
  it('returns other notes sharing a link, newest first', () => {
    const list = [n('a', ['x'], 1), n('b', ['x', 'y'], 3), n('c', ['y'], 2), n('d', ['z'], 4)];
    expect(relatedNotes(list, { id: 'a', linkIds: ['x'] }).map((x) => x.id)).toEqual(['b']);
    expect(relatedNotes(list, { id: 'a', linkIds: ['x', 'y'] }).map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('formats the day page title', () => {
    expect(dayTitle('2026-11-04')).toBe('4 ноября 2026');
  });
});
