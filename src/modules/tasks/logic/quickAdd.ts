import { addDays, addMonths, getDay, isValid } from 'date-fns';
import { fromDateKey, shiftDateKey, toDateKey } from '../../../core/dates';
import type { DateKey, Priority, Recurrence } from '../../../core/types';

/** What one line of quick add means. Fields that were not found are absent. */
export interface ParsedTask {
  title: string;
  dueDate?: DateKey;
  /** 'HH:mm' */
  dueTime?: string;
  /** Project name as typed after '#', without the '#'. */
  projectName?: string;
  priority?: Priority;
  tags: string[];
  estimateMin?: number;
  recurrence?: Recurrence;
}

// JS `\b` does not understand Cyrillic, so word edges are spelled out.
const START = '(?<![\\p{L}\\p{N}@#])';
const END = '(?![\\p{L}\\p{N}])';
const re = (body: string) => new RegExp(`${START}(?:${body})${END}`, 'iu');

const WEEKDAYS: [RegExp, number][] = [
  [/^(пн|понедельник|mon|monday)$/i, 1],
  [/^(вт|вторник|tue|tuesday)$/i, 2],
  [/^(ср|среда|среду|wed|wednesday)$/i, 3],
  [/^(чт|четверг|thu|thursday)$/i, 4],
  [/^(пт|пятница|пятницу|fri|friday)$/i, 5],
  [/^(сб|суббота|субботу|sat|saturday)$/i, 6],
  [/^(вс|воскресенье|sun|sunday)$/i, 0],
];
const WEEKDAY_WORD =
  'пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|среду|четверг|пятница|пятницу|суббота|субботу|воскресенье|' +
  'mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday';

/** Dative plural for «по вторникам», and the singular after «каждый/каждую/каждое». */
const WEEKDAY_PLURAL: [RegExp, number][] = [
  [/^(понедельникам|понедельник)$/i, 1],
  [/^(вторникам|вторник)$/i, 2],
  [/^(средам|среду)$/i, 3],
  [/^(четвергам|четверг)$/i, 4],
  [/^(пятницам|пятницу)$/i, 5],
  [/^(субботам|субботу)$/i, 6],
  [/^(воскресеньям|воскресенье)$/i, 0],
];
const PLURAL_WORD = 'понедельникам|вторникам|средам|четвергам|пятницам|субботам|воскресеньям';
const EACH_WORD = 'понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье';

const MONTHS: [RegExp, number][] = [
  [/^янв/i, 1],
  [/^фев/i, 2],
  [/^мар/i, 3],
  [/^апр/i, 4],
  [/^ма[йя]/i, 5],
  [/^июн/i, 6],
  [/^июл/i, 7],
  [/^авг/i, 8],
  [/^сен/i, 9],
  [/^окт/i, 10],
  [/^ноя/i, 11],
  [/^дек/i, 12],
];
const MONTH_WORD =
  'января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|' +
  'янв|фев|мар|апр|июн|июл|авг|сен|сент|окт|ноя|нояб|дек';

const lookup = (table: [RegExp, number][], word: string) => table.find(([r]) => r.test(word))?.[1];

/** Mutable parse state: text still unclaimed + what was found so far. */
interface State {
  text: string;
  today: DateKey;
  out: ParsedTask;
}

/** Finds the first match of `pattern`; if `accept` returns true, the fragment is removed from the text. */
function take(s: State, pattern: RegExp, accept: (m: RegExpExecArray) => boolean): boolean {
  const m = pattern.exec(s.text);
  if (!m || !accept(m)) return false;
  s.text = `${s.text.slice(0, m.index)} ${s.text.slice(m.index + m[0].length)}`;
  return true;
}

function nextWeekday(today: DateKey, weekday: number, includeToday: boolean): DateKey {
  const diff = (weekday - getDay(fromDateKey(today)) + 7) % 7;
  return shiftDateKey(today, diff === 0 && !includeToday ? 7 : diff);
}

/** A day/month(/year) date; without a year, a day already past this year means next year. */
function calendarDate(today: DateKey, day: number, month: number, year?: number): DateKey | undefined {
  const thisYear = Number(today.slice(0, 4));
  const build = (y: number) => {
    const d = new Date(y, month - 1, day);
    return isValid(d) && d.getMonth() === month - 1 && d.getDate() === day ? toDateKey(d) : undefined;
  };
  if (year !== undefined) return build(year);
  const candidate = build(thisYear);
  if (candidate === undefined) return undefined;
  return candidate < today ? build(thisYear + 1) : candidate;
}

function parseRecurrence(s: State): void {
  const set = (r: Recurrence) => {
    s.out.recurrence = r;
    return true;
  };
  take(s, re('каждый\\s+день|ежедневно|every\\s+day|daily'), () => set({ kind: 'daily' })) ||
    take(s, re('каждую\\s+неделю|еженедельно|every\\s+week|weekly'), () => set({ kind: 'weekly' })) ||
    take(s, re('каждый\\s+месяц|ежемесячно|every\\s+month|monthly'), () => set({ kind: 'monthly' })) ||
    take(s, re('по\\s+будням'), () => set({ kind: 'weekly', weekdays: [1, 2, 3, 4, 5] })) ||
    take(s, re('по\\s+выходным'), () => set({ kind: 'weekly', weekdays: [0, 6] })) ||
    take(s, re(`по\\s+((?:${PLURAL_WORD})(?:\\s*(?:,|и)\\s*(?:${PLURAL_WORD}))*)`), (m) =>
      set({ kind: 'weekly', weekdays: weekdayList(m[1]) }),
    ) ||
    take(s, re(`кажд(?:ый|ую|ое)\\s+(${EACH_WORD})`), (m) => set({ kind: 'weekly', weekdays: weekdayList(m[1]) })) ||
    take(s, re('каждые\\s+(\\d{1,3})\\s+(дн(?:я|ей)|недел[иь])'), (m) => {
      const n = Number(m[1]) * (m[2].toLowerCase().startsWith('нед') ? 7 : 1);
      return n > 0 && set({ kind: 'everyNDays', interval: n });
    });
}

function weekdayList(words: string): number[] {
  const days = words
    .split(/\s*(?:,|\sи\s)\s*/iu)
    .map((w) => lookup(WEEKDAY_PLURAL, w.trim()))
    .filter((d): d is number => d !== undefined);
  return [...new Set(days)].sort((a, b) => a - b);
}

function parseDate(s: State): void {
  const { today } = s;
  const set = (date: DateKey | undefined) => {
    if (date === undefined) return false;
    s.out.dueDate = date;
    return true;
  };
  const RELATIVE: Record<string, number> = { сегодня: 0, today: 0, завтра: 1, tomorrow: 1, послезавтра: 2 };
  take(s, re('сегодня|завтра|послезавтра|today|tomorrow'), (m) =>
    set(shiftDateKey(today, RELATIVE[m[0].toLowerCase()])),
  ) ||
    take(s, re('через\\s+(?:(\\d{1,3})\\s+)?(день|дня|дней|неделю|недели|недель|месяц|месяца|месяцев)'), (m) => {
      const n = m[1] === undefined ? 1 : Number(m[1]);
      const unit = m[2].toLowerCase();
      if (unit.startsWith('мес')) return set(toDateKey(addMonths(fromDateKey(today), n)));
      return set(toDateKey(addDays(fromDateKey(today), unit.startsWith('нед') ? n * 7 : n)));
    }) ||
    take(s, re(`(?:(?:в|во|on)\\s+)?(${WEEKDAY_WORD})`), (m) =>
      set(nextWeekday(today, lookup(WEEKDAYS, m[1]) ?? 0, false)),
    ) ||
    take(s, re('(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{4}))?'), (m) =>
      set(calendarDate(today, Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined)),
    ) ||
    take(s, re(`(\\d{1,2})\\s+(${MONTH_WORD})\\.?(?:\\s+(\\d{4}))?`), (m) =>
      set(calendarDate(today, Number(m[1]), lookup(MONTHS, m[2]) ?? 0, m[3] ? Number(m[3]) : undefined)),
    );
}

const pad = (n: number) => String(n).padStart(2, '0');

function toTime(hour: number, minute: number, part?: string): string | undefined {
  let h = hour;
  const p = part?.toLowerCase();
  if ((p === 'вечера' || p === 'дня') && h < 12) h += 12;
  if ((p === 'утра' || p === 'ночи') && h === 12) h = 0;
  return h < 24 && minute < 60 ? `${pad(h)}:${pad(minute)}` : undefined;
}

function parseTime(s: State): void {
  const set = (time: string | undefined) => {
    if (time === undefined) return false;
    s.out.dueTime = time;
    return true;
  };
  take(s, re('(?:в|at)\\s+(\\d{1,2})(?::(\\d{2}))?(?:\\s+(утра|дня|вечера|ночи))?'), (m) =>
    set(toTime(Number(m[1]), Number(m[2] ?? 0), m[3])),
  ) ||
    take(s, re('(\\d{1,2}):(\\d{2})(?:\\s+(утра|дня|вечера|ночи))?'), (m) =>
      set(toTime(Number(m[1]), Number(m[2]), m[3])),
    );
}

function parseMarkers(s: State): void {
  take(s, new RegExp(`${START}#([\\p{L}\\p{N}_-]+)`, 'u'), (m) => {
    s.out.projectName = m[1];
    return true;
  });
  take(s, re('!([1-4])'), (m) => {
    s.out.priority = Number(m[1]) as Priority;
    return true;
  });
  take(s, re('~\\s?(\\d+(?:[.,]\\d+)?)\\s?(ч|час|часа|часов|h|м|мин|m|min)'), (m) => {
    const value = Number(m[1].replace(',', '.'));
    const hours = /^(ч|h)/i.test(m[2]);
    s.out.estimateMin = Math.round(hours ? value * 60 : value);
    return true;
  });
  while (
    take(s, new RegExp(`${START}@([\\p{L}\\p{N}_-]+)${END}`, 'u'), (m) => {
      s.out.tags.push(m[1]);
      return true;
    })
  );
}

/** Where a recurring task without an explicit date starts: today, or the first matching weekday from today. */
function firstOccurrence(r: Recurrence, today: DateKey): DateKey {
  if (r.kind !== 'weekly' || !r.weekdays?.length) return today;
  return r.weekdays.map((d) => nextWeekday(today, d, true)).sort()[0];
}

const QUOTED = /"[^"]*"|«[^»]*»|“[^”]*”/g;

/**
 * Parses one line of quick add, e.g. «завтра 9:00 позвонить научнику #учёба !1».
 * Recognised fragments are removed from the title; text in quotes is never interpreted.
 */
export function parseQuickAdd(input: string, today: DateKey): ParsedTask {
  const quotes: string[] = [];
  // Placeholders contain no letters or digits, so they never match a pattern.
  const masked = input.replace(QUOTED, (q) => `\u0000${'\u0001'.repeat(quotes.push(q))}\u0000`);
  const s: State = { text: ` ${masked} `, today, out: { title: '', tags: [] } };

  parseMarkers(s);
  parseRecurrence(s);
  parseDate(s);
  parseTime(s);

  const { out } = s;
  if (out.dueTime && !out.dueDate) out.dueDate = today;
  if (out.recurrence) {
    if (!out.dueDate) out.dueDate = firstOccurrence(out.recurrence, today);
    if (out.recurrence.kind === 'weekly' && !out.recurrence.weekdays) {
      out.recurrence = { kind: 'weekly', weekdays: [getDay(fromDateKey(out.dueDate))] };
    }
  }
  out.title = s.text
    .replace(/\u0000(\u0001+)\u0000/g, (_, n: string) => quotes[n.length - 1])
    .replace(/\s+/g, ' ')
    .trim();
  return out;
}
