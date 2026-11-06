import { describe, expect, it } from 'vitest';
import type { Note } from '../../../core/types';
import { filterNotes, noteTitle, toggleLink } from './notes';

const note = (over: Partial<Note>): Note => ({
  id: 'n',
  createdAt: 1,
  updatedAt: 1,
  title: '',
  body: '',
  linkIds: [],
  ...over,
});

describe('filterNotes', () => {
  const a = note({ id: 'a', title: 'Билеты', body: 'Купить ПАСПОРТ', linkIds: ['p1'], updatedAt: 1 });
  const b = note({ id: 'b', title: 'Экзамен', body: 'повторить', linkIds: ['e1', 'p1'], updatedAt: 3 });
  const c = note({ id: 'c', title: 'Идеи', body: '', updatedAt: 2 });

  it('Given список заметок When я ищу по слову Then фильтр по заголовку и тексту без учёта регистра', () => {
    expect(filterNotes([a, b, c], { query: 'паспорт' }).map((n) => n.id)).toEqual(['a']);
    expect(filterNotes([a, b, c], { query: 'ЭКЗАМЕН' }).map((n) => n.id)).toEqual(['b']);
  });

  it('Given заметки со ссылками When фильтрую по проекту или событию Then остаются привязанные; новые сверху', () => {
    expect(filterNotes([a, b, c], { linkId: 'p1' }).map((n) => n.id)).toEqual(['b', 'a']);
    expect(filterNotes([a, b, c], { linkId: 'e1' }).map((n) => n.id)).toEqual(['b']);
    expect(filterNotes([a, b, c], {}).map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('noteTitle', () => {
  it('Given заметка без названия When показываю Then «Без названия»', () => {
    expect(noteTitle(note({ title: '  ' }))).toBe('Без названия');
    expect(noteTitle(note({ title: 'Да' }))).toBe('Да');
  });
});

describe('toggleLink', () => {
  it('Given привязка When переключаю Then id добавляется один раз и снимается', () => {
    expect(toggleLink(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleLink(['a', 'b'], 'a')).toEqual(['b']);
  });
});
