import { addDays, addMonths, getDay } from 'date-fns';
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

// JS `\b` does not understand Cyrillic, so word edges are spelled out. A fragment must not end
// right before (or start right after) «.5», «:30» or «-2» — otherwise «18.30» would match as «18» and leave «.30».
const START = '(?<![\\p{L}\\p{N}@#]|\\d[.:,\\-])';
const END = '(?![\\p{L}\\p{N}]|[.:,\\-]\\d)';
const re = (body: string) => new RegExp(`${START}(?:${body})${END}`, 'iu');

/** Every spelling of a weekday we understand (one-off dates and recurrences). */
const WEEKDAY_FORMS: [number, string[]][] = [
  [1, ['пн', 'понедельник', 'понедельникам', 'mon', 'monday']],
  [2, ['вт', 'вторник', 'вторникам', 'tue', 'tuesday']],
  [3, ['ср', 'среда', 'среду', 'средам', 'wed', 'wednesday']],
  [4, ['чт', 'четверг', 'четвергам', 'thu', 'thursday']],
  [5, ['пт', 'пятница', 'пятницу', 'пятницам', 'fri', 'friday']],
  [6, ['сб', 'суббота', 'субботу', 'субботам', 'sat', 'saturday']],
  [0, ['вс', 'воскресенье', 'воскресеньям', 'sun', 'sunday']],
];
/** «СБ», «ПН и ЧТ»: an all-caps two-letter weekday is more likely an acronym. */
const isAcronym = (words: string) => /^\p{Lu}{2}(?!\p{L})/u.test(words);
const weekdayOf = (word: string) => WEEKDAY_FORMS.find(([, forms]) => forms.includes(word.toLowerCase()))?.[0];

const DATE_WEEKDAY =
  'пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|среду|четверг|пятница|пятницу|суббота|субботу|воскресенье|' +
  'mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const PLURAL_WEEKDAY = 'понедельникам|вторникам|средам|четвергам|пятницам|субботам|воскресеньям';
const SHORT_WEEKDAY = 'пн|вт|ср|чт|пт|сб|вс|mon|tue|wed|thu|fri|sat|sun';
const EACH_WEEKDAY =
  'понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье|' +
  `monday|tuesday|wednesday|thursday|friday|saturday|sunday|${SHORT_WEEKDAY}`;
/** «вторник», «вторник и четверг», «пн, ср и пт». */
const listOf = (word: string) => `(?:${word})(?:\\s*(?:,|\\sи\\s|\\sand\\s)\\s*(?:${word}))*`;

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
const monthOf = (word: string) => MONTHS.find(([r]) => r.test(word))?.[1] ?? 0;

/** Nouns that turn «в 2 …» into a quantity («в 2 раза»), not a time. */
const QUANTITY_NOUN =
  'раз|процент|%|лет|год|класс|этаж|ряд|клик|шаг|минут|секунд|кабинет|корпус|аудитори|очеред|колон|строк|' +
  'экземпляр|рук|групп|стопк|этап|тысяч|слой|подход|смен|приём|раунд|кругов|штук|человек';
/**
 * Stops «в N …» from being a time when a quantity, a month («в 5 ноября» is a date) or a plural noun
 * in -ах/-ях/-ов/-ей («в 2 экземплярах») follows.
 */
const NOT_AN_HOUR =
  `(?!\\s*(?:${QUANTITY_NOUN}))(?!\\s+(?:${MONTH_WORD})(?![\\p{L}]))` +
  '(?!\\s+(?!час)\\p{L}+(?:ах|ях|ов|ей)(?![\\p{L}]))';
const PART_OF_DAY = 'утра|дня|вечера|ночи';
const HOUR_WORD = '(?:\\s*(?:часа|часов|час|ч))?';

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

function exactDate(year: number, month: number, day: number): DateKey | undefined {
  const d = new Date(year, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day ? toDateKey(d) : undefined;
}

/**
 * A day + month (+ year). Without a year it is the nearest such day from today on — a date already
 * past this year means next year, and 29 February waits for the next leap year.
 */
function calendarDate(today: DateKey, day: number, month: number, year?: string): DateKey | undefined {
  if (year !== undefined) return exactDate(year.length === 2 ? 2000 + Number(year) : Number(year), month, day);
  const thisYear = Number(today.slice(0, 4));
  for (let y = thisYear; y <= thisYear + 8; y++) {
    const date = exactDate(y, month, day);
    if (date !== undefined && date >= today) return date;
  }
  return undefined;
}

function parseRecurrence(s: State): void {
  const set = (r: Recurrence) => {
    s.out.recurrence = r;
    return true;
  };
  const weekdays = (words: string) => {
    const days = words.split(/\s*(?:,|\sи\s|\sand\s)\s*/iu).map((w) => weekdayOf(w.trim()));
    return [...new Set(days.filter((d) => d !== undefined))].sort((a, b) => a - b);
  };
  // Patterns are tried in order; the first one that matches wins.
  void (
    take(s, re('каждый\\s+день|ежедневно|every\\s+day|daily'), () => set({ kind: 'daily' })) ||
    take(s, re('каждую\\s+неделю|еженедельно|every\\s+week|weekly'), () => set({ kind: 'weekly' })) ||
    take(s, re('каждый\\s+месяц|ежемесячно|every\\s+month|monthly'), () => set({ kind: 'monthly' })) ||
    take(s, re('по\\s+будням'), () => set({ kind: 'weekly', weekdays: [1, 2, 3, 4, 5] })) ||
    take(s, re('по\\s+выходным'), () => set({ kind: 'weekly', weekdays: [0, 6] })) ||
    take(
      s,
      re(`по\\s+(${listOf(`${PLURAL_WEEKDAY}|${SHORT_WEEKDAY}`)})`),
      // «по СР» (самостоятельная работа) is an acronym, not «по средам».
      (m) => !isAcronym(m[1]) && set({ kind: 'weekly', weekdays: weekdays(m[1]) }),
    ) ||
    take(s, re(`(?:кажд(?:ый|ую|ое|ая)|every)\\s+(${listOf(EACH_WEEKDAY)})`), (m) =>
      set({ kind: 'weekly', weekdays: weekdays(m[1]) }),
    ) ||
    take(s, re('каждые\\s+(\\d{1,3})\\s+(дн(?:я|ей)|недел[иь])'), (m) => {
      const n = Number(m[1]) * (m[2].toLowerCase().startsWith('нед') ? 7 : 1);
      return n > 0 && set({ kind: 'everyNDays', interval: n });
    })
  );
}

function parseDate(s: State): void {
  const { today } = s;
  const set = (date: DateKey | undefined) => {
    if (date === undefined) return false;
    s.out.dueDate = date;
    return true;
  };
  const RELATIVE: Record<string, number> = { сегодня: 0, today: 0, завтра: 1, tomorrow: 1, послезавтра: 2 };
  // Patterns are tried in order; the first one that matches wins.
  void (
    take(s, re('сегодня|завтра|послезавтра|today|tomorrow'), (m) =>
      set(shiftDateKey(today, RELATIVE[m[0].toLowerCase()])),
    ) ||
    take(s, re('через\\s+(?:(\\d{1,3})\\s+)?(день|дня|дней|неделю|недели|недель|месяц|месяца|месяцев)'), (m) => {
      const n = m[1] === undefined ? 1 : Number(m[1]);
      const unit = m[2].toLowerCase();
      if (unit.startsWith('мес')) return set(toDateKey(addMonths(fromDateKey(today), n)));
      return set(toDateKey(addDays(fromDateKey(today), unit.startsWith('нед') ? n * 7 : n)));
    }) ||
    take(
      s,
      re(`((?:в|во|on)\\s+)?(?:(?:следующ(?:ий|ую|ее|ая)|next)\\s+)?(${DATE_WEEKDAY})`),
      // A bare upper-case abbreviation («СБ», «ЧТ») is more likely an acronym than a weekday.
      (m) => (m[1] !== undefined || !isAcronym(m[2])) && set(nextWeekday(today, weekdayOf(m[2]) ?? 0, false)),
    ) ||
    take(s, re('(?:(?:в|на)\\s+)?(\\d{1,2})\\.(\\d{2})(?:\\.(\\d{4}|\\d{2}))?'), (m) =>
      set(calendarDate(today, Number(m[1]), Number(m[2]), m[3])),
    ) ||
    take(s, re(`(?:(?:в|на)\\s+)?(\\d{1,2})\\s+(${MONTH_WORD})\\.?(?:\\s+(\\d{4}))?`), (m) =>
      set(calendarDate(today, Number(m[1]), monthOf(m[2]), m[3])),
    )
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 24-hour 'HH:mm' from an hour, minutes and an optional «утра/дня/вечера/ночи»; undefined if impossible. */
function toTime(hour: number, minute: number, part?: string): string | undefined {
  if (minute > 59) return undefined;
  if (part === undefined) return hour < 24 ? `${pad(hour)}:${pad(minute)}` : undefined;
  const h = ((): number | undefined => {
    switch (part.toLowerCase()) {
      case 'утра':
        return hour >= 1 && hour <= 11 ? hour : undefined;
      case 'дня':
        return hour >= 12 && hour <= 17 ? hour : hour >= 1 && hour <= 5 ? hour + 12 : undefined;
      case 'вечера':
        return hour >= 3 && hour <= 11 ? hour + 12 : hour >= 15 && hour <= 23 ? hour : undefined;
      default: // ночи
        return hour === 12 ? 0 : hour <= 5 ? hour : hour >= 9 && hour <= 11 ? hour + 12 : undefined;
    }
  })();
  return h === undefined ? undefined : `${pad(h)}:${pad(minute)}`;
}

function parseTime(s: State): void {
  const set = (time: string | undefined) => {
    if (time === undefined) return false;
    s.out.dueTime = time;
    return true;
  };
  // «в 9», «в 18:30», «в 18.30», «в 9 часов утра», «at 6».
  // Patterns are tried in order; the first one that matches wins.
  void (
    take(s, re(`(?:в|at)\\s+(\\d{1,2})(?:[:.](\\d{2}))?${NOT_AN_HOUR}${HOUR_WORD}(?:\\s+(${PART_OF_DAY}))?`), (m) =>
      set(toTime(Number(m[1]), Number(m[2] ?? 0), m[3])),
    ) ||
    // «7:00-8:00»: a range keeps its start time.
    take(s, re('(?:(?:в|с|at)\\s+)?(\\d{1,2}):(\\d{2})\\s?[-–]\\s?\\d{1,2}:\\d{2}'), (m) =>
      set(toTime(Number(m[1]), Number(m[2]))),
    ) ||
    // «9:00», «18:30 вечера» (a colon is needed — «12.11» without «в» is a date).
    take(s, re(`(?:(?:в|at)\\s+)?(\\d{1,2}):(\\d{2})(?:\\s+(${PART_OF_DAY}))?`), (m) =>
      set(toTime(Number(m[1]), Number(m[2]), m[3])),
    )
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
  const HOURS = '(?:часа|часов|час|ч|h)';
  const MINUTES = '(?:минуты|минут|мин|м|min|m)';
  take(s, re(`~\\s?(?:(\\d+(?:[.,]\\d+)?)\\s?${HOURS})?\\s?(?:(\\d+)\\s?${MINUTES})?`), (m) => {
    const minutes = Math.round(Number((m[1] ?? '0').replace(',', '.')) * 60 + Number(m[2] ?? 0));
    if (minutes <= 0) return false;
    s.out.estimateMin = minutes;
    return true;
  });
  while (
    take(s, new RegExp(`${START}@([\\p{L}\\p{N}_-]+)${END}`, 'u'), (m) => {
      if (!s.out.tags.includes(m[1])) s.out.tags.push(m[1]);
      return true;
    })
  );
}

/** Where a recurring task without an explicit date starts: today, or the first matching weekday from today. */
function firstOccurrence(r: Recurrence, today: DateKey): DateKey {
  if (r.kind !== 'weekly' || !r.weekdays?.length) return today;
  return r.weekdays.map((d) => nextWeekday(today, d, true)).sort()[0];
}

const QUOTED = /"[^"]*"|«[^»]*»|“[^”]*”|„[^“”]*[“”]|'[^']*'/g;

/**
 * Parses one line of quick add, e.g. «завтра 9:00 позвонить научнику #учёба !1».
 * Recognised fragments are removed from the title; text in quotes is never interpreted.
 */
export function parseQuickAdd(input: string, today: DateKey): ParsedTask {
  const quotes: string[] = [];
  // Quoted text is swapped for placeholders made of control characters (never matched by any pattern).
  const masked = input
    // oxlint-disable-next-line no-control-regex -- strips our own placeholder characters
    .replace(/[\u0000\u0001]/g, ' ')
    .replace(QUOTED, (q) => `\u0000${'\u0001'.repeat(quotes.push(q))}\u0000`);
  const s: State = { text: ` ${masked} `, today, out: { title: '', tags: [] } };

  parseMarkers(s);
  parseRecurrence(s);
  parseTime(s); // before dates: «в 10.10» is a time, «10.10» alone is a date
  parseDate(s);

  const { out } = s;
  if (out.dueTime && !out.dueDate) out.dueDate = today;
  if (out.recurrence) {
    if (!out.dueDate) out.dueDate = firstOccurrence(out.recurrence, today);
    if (out.recurrence.kind === 'weekly' && !out.recurrence.weekdays) {
      out.recurrence = { kind: 'weekly', weekdays: [getDay(fromDateKey(out.dueDate))] };
    }
  }
  out.title = s.text
    // oxlint-disable-next-line no-control-regex -- restores the quote placeholders
    .replace(/\u0000(\u0001+)\u0000/g, (_, n: string) => quotes[n.length - 1])
    .replace(/\s+/g, ' ')
    .trim();
  return out;
}
