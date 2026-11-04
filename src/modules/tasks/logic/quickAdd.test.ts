import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickAdd';

// Wednesday.
const TODAY = '2026-11-04';
const parse = (input: string) => parseQuickAdd(input, TODAY);

describe('parseQuickAdd', () => {
  it('Given строка «завтра 9:00 позвонить научнику #учёба !1» и сегодня 2026-11-04 When она разбирается Then title «позвонить научнику», dueDate 2026-11-05, dueTime 09:00, projectName «учёба», priority 1', () => {
    expect(parse('завтра 9:00 позвонить научнику #учёба !1')).toEqual({
      title: 'позвонить научнику',
      dueDate: '2026-11-05',
      dueTime: '09:00',
      projectName: 'учёба',
      priority: 1,
      tags: [],
    });
  });

  it('plain text stays a title without anything else', () => {
    expect(parse('  купить   молоко ')).toEqual({ title: 'купить молоко', tags: [] });
  });

  describe('Given относительные даты: сегодня, завтра, послезавтра, через 3 дня, через неделю When они разбираются Then дата считается от переданного «сегодня»', () => {
    it.each([
      ['сегодня сдать отчёт', '2026-11-04'],
      ['сдать отчёт завтра', '2026-11-05'],
      ['Завтра сдать отчёт', '2026-11-05'],
      ['послезавтра сдать отчёт', '2026-11-06'],
      ['через 3 дня сдать отчёт', '2026-11-07'],
      ['через 1 день сдать отчёт', '2026-11-05'],
      ['через 10 дней сдать отчёт', '2026-11-14'],
      ['через неделю сдать отчёт', '2026-11-11'],
      ['через 2 недели сдать отчёт', '2026-11-18'],
      ['через месяц сдать отчёт', '2026-12-04'],
      ['today сдать отчёт', '2026-11-04'],
      ['tomorrow сдать отчёт', '2026-11-05'],
    ])('%s → %s', (input, dueDate) => {
      expect(parse(input)).toMatchObject({ title: 'сдать отчёт', dueDate });
    });
  });

  describe('Given дни недели: в пн, в пятницу, пт, mon, fri When они разбираются Then берётся ближайший такой день в будущем (сегодняшний день недели → через неделю)', () => {
    it.each([
      ['в пн созвон', '2026-11-09'],
      ['созвон в пятницу', '2026-11-06'],
      ['пт созвон', '2026-11-06'],
      ['mon созвон', '2026-11-09'],
      ['fri созвон', '2026-11-06'],
      ['во вторник созвон', '2026-11-10'],
      ['в четверг созвон', '2026-11-05'],
      ['в воскресенье созвон', '2026-11-08'],
      ['в ср созвон', '2026-11-11'],
      ['в среду созвон', '2026-11-11'],
    ])('%s → %s', (input, dueDate) => {
      expect(parse(input)).toMatchObject({ title: 'созвон', dueDate });
    });
  });

  describe('Given даты «12.11» и «12 ноября», уже прошедшие в этом году When они разбираются Then берётся следующий год', () => {
    it.each([
      ['сдать 12.11', '2026-11-12'],
      ['сдать 03.11', '2027-11-03'],
      ['сдать 04.11', '2026-11-04'],
      ['сдать 12 ноября', '2026-11-12'],
      ['сдать 3 ноября', '2027-11-03'],
      ['сдать 1 января', '2027-01-01'],
      ['сдать 5 дек', '2026-12-05'],
      ['сдать 15.01.2028', '2028-01-15'],
      ['сдать 2 марта 2027', '2027-03-02'],
    ])('%s → %s', (input, dueDate) => {
      expect(parse(input)).toMatchObject({ title: 'сдать', dueDate });
    });

    it('an impossible date stays in the title', () => {
      expect(parse('сдать 31.02')).toEqual({ title: 'сдать 31.02', tags: [] });
    });
  });

  describe('Given время «в 9», «в 18:30», «9:00» без даты When оно разбирается Then dueDate = сегодня', () => {
    it.each([
      ['в 9 зарядка', '09:00'],
      ['зарядка в 18:30', '18:30'],
      ['9:00 зарядка', '09:00'],
      ['зарядка в 7 вечера', '19:00'],
      ['зарядка в 8 утра', '08:00'],
      ['зарядка в 12 ночи', '00:00'],
      ['зарядка at 6', '06:00'],
    ])('%s → %s', (input, dueTime) => {
      expect(parse(input)).toMatchObject({ title: 'зарядка', dueDate: TODAY, dueTime });
    });

    it('an impossible time stays in the title', () => {
      expect(parse('зарядка 25:00')).toEqual({ title: 'зарядка 25:00', tags: [] });
    });

    it('combines a date and a time in any order', () => {
      expect(parse('экзамен в 10 в пт')).toMatchObject({ title: 'экзамен', dueDate: '2026-11-06', dueTime: '10:00' });
    });
  });

  describe('Given повторы «каждый день», «каждую неделю», «по будням» When они разбираются Then заполняется recurrence соответствующего вида', () => {
    it.each([
      ['каждый день зарядка', { kind: 'daily' }, TODAY],
      ['зарядка ежедневно', { kind: 'daily' }, TODAY],
      ['каждую неделю зарядка', { kind: 'weekly', weekdays: [3] }, TODAY],
      ['по будням зарядка', { kind: 'weekly', weekdays: [1, 2, 3, 4, 5] }, TODAY],
      ['по выходным зарядка', { kind: 'weekly', weekdays: [0, 6] }, '2026-11-07'],
      ['каждый понедельник зарядка', { kind: 'weekly', weekdays: [1] }, '2026-11-09'],
      ['по вторникам и четвергам зарядка', { kind: 'weekly', weekdays: [2, 4] }, '2026-11-05'],
      ['каждый месяц зарядка', { kind: 'monthly' }, TODAY],
      ['каждые 3 дня зарядка', { kind: 'everyNDays', interval: 3 }, TODAY],
      ['каждые 2 недели зарядка', { kind: 'everyNDays', interval: 14 }, TODAY],
      ['every day зарядка', { kind: 'daily' }, TODAY],
    ])('%s', (input, recurrence, dueDate) => {
      expect(parse(input)).toEqual({ title: 'зарядка', recurrence, dueDate, tags: [] });
    });

    it('keeps an explicit start date and uses its weekday for «каждую неделю»', () => {
      expect(parse('в пт каждую неделю отчёт')).toMatchObject({
        title: 'отчёт',
        dueDate: '2026-11-06',
        recurrence: { kind: 'weekly', weekdays: [5] },
      });
    });
  });

  describe('Given «@тег», «~30м», «~1ч» When они разбираются Then теги и estimateMin заполнены', () => {
    it('tags and minutes', () => {
      expect(parse('прочитать главу @чтение @вечер ~30м')).toEqual({
        title: 'прочитать главу',
        tags: ['чтение', 'вечер'],
        estimateMin: 30,
      });
    });

    it.each([
      ['~1ч', 60],
      ['~1.5ч', 90],
      ['~2 ч', 120],
      ['~45мин', 45],
      ['~2h', 120],
    ])('%s → %i min', (estimate, minutes) => {
      expect(parse(`отчёт ${estimate}`)).toMatchObject({ title: 'отчёт', estimateMin: minutes });
    });
  });

  it('priorities !1…!4 and the first #project win; the rest stays in the text', () => {
    expect(parse('отчёт !3 #Работа')).toMatchObject({ title: 'отчёт', priority: 3, projectName: 'Работа' });
    expect(parse('отчёт !5')).toMatchObject({ title: 'отчёт !5' });
  });

  it('an email or a word with # inside is not a tag or a project', () => {
    expect(parse('написать на a@b.ru про C#')).toEqual({ title: 'написать на a@b.ru про C#', tags: [] });
  });

  it('Given слово в кавычках: «прочитать "завтра" Бродского» When строка разбирается Then кавычки защищают текст — дата не ставится', () => {
    expect(parse('прочитать "завтра" Бродского')).toEqual({ title: 'прочитать "завтра" Бродского', tags: [] });
    expect(parse('посмотреть «Через неделю» в пт')).toMatchObject({
      title: 'посмотреть «Через неделю»',
      dueDate: '2026-11-06',
    });
  });

  describe('review: tricky inputs', () => {
    it.each([
      ['лечь спать в 11 ночи', 'лечь спать', '23:00'],
      ['лечь спать в 2 ночи', 'лечь спать', '02:00'],
      ['обед в 1 дня', 'обед', '13:00'],
      ['обед в 12 дня', 'обед', '12:00'],
      ['встреча в 10.10', 'встреча', '10:10'],
      ['в 18.30 ужин', 'ужин', '18:30'],
      ['позвонить в 15 часов', 'позвонить', '15:00'],
      ['встреча в 9 часов утра', 'встреча', '09:00'],
    ])('%s → %s at %s', (input, title, dueTime) => {
      expect(parse(input)).toMatchObject({ title, dueTime, dueDate: TODAY });
    });

    it.each([
      'встреча 1.5 часа',
      'глава 3.2 прочитать',
      'iOS 17.4 обновить',
      'увеличить в 2 раза',
      'скидка в 5 процентов',
      'в 3 ряда сложить',
      'в 1 клик оплатить',
      'в 20 лет',
      'в 9 класс записать',
      'обед в 11 дня',
      'встать в 13 утра',
      'встреча в 7:3',
      'отчёт для СБ',
      'ЧТ-2 заказать',
    ])('«%s» has no date or time', (input) => {
      expect(parse(input)).toEqual({ title: input, tags: [] });
    });

    it('two-digit years and leap days', () => {
      expect(parse('сдать 12.11.26')).toMatchObject({ title: 'сдать', dueDate: '2026-11-12' });
      expect(parse('праздник 29.02')).toMatchObject({ title: 'праздник', dueDate: '2028-02-29' });
      expect(parse('праздник 29 февраля')).toMatchObject({ dueDate: '2028-02-29' });
    });

    it('protects „…“ and single quotes too', () => {
      expect(parse('прочитать „завтра“ Бродского')).toEqual({ title: 'прочитать „завтра“ Бродского', tags: [] });
      expect(parse("прочитать 'завтра' Бродского")).toEqual({ title: "прочитать 'завтра' Бродского", tags: [] });
    });

    it('several weekdays after «каждый», and «каждая пятница»', () => {
      expect(parse('каждый вторник и четверг зарядка')).toMatchObject({
        title: 'зарядка',
        recurrence: { kind: 'weekly', weekdays: [2, 4] },
      });
      expect(parse('каждая пятница отчёт')).toMatchObject({
        title: 'отчёт',
        recurrence: { kind: 'weekly', weekdays: [5] },
        dueDate: '2026-11-06',
      });
      expect(parse('every monday отчёт')).toMatchObject({
        title: 'отчёт',
        recurrence: { kind: 'weekly', weekdays: [1] },
      });
    });

    it('«в следующий понедельник» is the nearest Monday', () => {
      expect(parse('в следующий понедельник созвон')).toMatchObject({ title: 'созвон', dueDate: '2026-11-09' });
    });

    it('estimates in words and combined, zero ignored', () => {
      expect(parse('отчёт ~30 минут')).toMatchObject({ title: 'отчёт', estimateMin: 30 });
      expect(parse('отчёт ~1ч30м')).toMatchObject({ title: 'отчёт', estimateMin: 90 });
      expect(parse('отчёт ~0м')).toEqual({ title: 'отчёт ~0м', tags: [] });
    });

    it('duplicate tags are kept once', () => {
      expect(parse('отчёт @a @a')).toMatchObject({ tags: ['a'] });
    });

    it('control characters in the input do not leak into the title', () => {
      expect(parse('a\u0000\u0001\u0000b')).toEqual({ title: 'a b', tags: [] });
    });
  });

  it('words that only contain a keyword are not dates', () => {
    expect(parse('завтрак с командой')).toEqual({ title: 'завтрак с командой', tags: [] });
    expect(parse('пнуть мяч')).toEqual({ title: 'пнуть мяч', tags: [] });
  });
});
