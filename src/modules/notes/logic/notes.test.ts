import { describe, expect, it, vi } from 'vitest';
import type { Note } from '../../../core/types';
import { filterNotes, formatDay, linkLabels, noteTitle, projectLabel, projectsForPicker, toggleLink } from './notes';

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
    expect(filterNotes([a, b, c], { linkIds: ['p1'] }).map((n) => n.id)).toEqual(['b', 'a']);
    expect(filterNotes([a, b, c], { linkIds: ['e1'] }).map((n) => n.id)).toEqual(['b']);
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

describe('filterNotes — один проход', () => {
  it('Given 500 заметок When я ввожу текст в поиск Then filterNotes проходит список один раз', () => {
    const notes = Array.from({ length: 500 }, (_, i) =>
      note({ id: `n${i}`, title: `Заметка ${i}`, linkIds: i % 2 ? ['p1', 'e1'] : ['p1'], updatedAt: i }),
    );
    const spy = vi.spyOn(Array.prototype, 'filter');
    const result = filterNotes(notes, { query: 'заметка 4', linkIds: ['p1', 'e1'] });
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls).toBe(1);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((n) => n.linkIds.includes('e1') && n.title.includes('4'))).toBe(true);
  });
});

describe('даты и метки привязок', () => {
  it('Given привязка к дню When показываю Then русский формат «7 ноя 2026»', () => {
    expect(formatDay('2026-11-07')).toBe('7 ноя 2026');
    expect(formatDay('2026-05-01')).toBe('1 мая 2026');
    expect(formatDay('2026-09-30')).toBe('30 сен 2026');
    const months = Array.from({ length: 12 }, (_, m) => formatDay(`2026-${String(m + 1).padStart(2, '0')}-15`));
    expect(months.map((x) => x.split(' ')[1])).toEqual([
      'янв',
      'фев',
      'мар',
      'апр',
      'мая',
      'июн',
      'июл',
      'авг',
      'сен',
      'окт',
      'ноя',
      'дек',
    ]);
  });

  it('Given проект в архиве When строю выбор привязки Then он в конце списка с пометкой «в архиве»', () => {
    const projects = [
      { id: 'a', name: 'Старый', archived: true },
      { id: 'b', name: 'Новый', archived: false },
    ];
    expect(projectsForPicker(projects).map((p) => p.id)).toEqual(['b', 'a']);
    expect(projectLabel(projects[0]!)).toBe('Старый (в архиве)');
    expect(projectLabel(projects[1]!)).toBe('Новый');
  });

  it('Given заметка с привязками When показываю карточку Then проект (с пометкой), событие и день по-русски', () => {
    const labels = linkLabels(['a', 'e', '2026-11-07', 'ghost'], {
      projects: [{ id: 'a', name: 'Старый', archived: true, createdAt: 1, updatedAt: 1 }],
      events: [{ id: 'e', title: 'IELTS' }],
    });
    expect(labels).toEqual(['Старый (в архиве)', 'IELTS', '7 ноя 2026']);
  });
});
