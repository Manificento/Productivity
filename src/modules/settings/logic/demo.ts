import { fromDateKey, shiftDateKey } from '../../../core/dates';
import type {
  CheckIn,
  CognitiveTest,
  DateKey,
  Food,
  Habit,
  HabitLog,
  LifeEvent,
  MealLog,
  Millis,
  Project,
  Setting,
  SleepLog,
  Task,
  TimeCategory,
  TimeEntry,
  WorkoutLog,
} from '../../../core/types';

/** Two weeks of history, ending today. */
export const DEMO_DAYS = 14;
/** The demo exam is this many days ahead, so the app is in the «подготовка» phase. */
export const DEMO_EVENT_IN_DAYS = 5;

/** One array per database table — the `tables` part of a backup. */
export interface DemoTables {
  projects: Project[];
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  timeCategories: TimeCategory[];
  timeEntries: TimeEntry[];
  sleepLogs: SleepLog[];
  foods: Food[];
  mealLogs: MealLog[];
  workoutLogs: WorkoutLog[];
  checkIns: CheckIn[];
  cognitiveTests: CognitiveTest[];
  lifeEvents: LifeEvent[];
  settings: Setting[];
}

/** Small seeded PRNG (mulberry32): the same day always gives the same demo. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Local time on a day; minutes may overflow into the next hours/day. */
function at(day: DateKey, hours: number, minutes = 0): Millis {
  const d = fromDateKey(day);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

/** Category, start hour, start minute, duration in minutes, source, optional task. */
type PlannedEntry = [string, number, number, number, TimeEntry['source'], string?];

const base = (id: string, time: Millis) => ({ id: `demo-${id}`, createdAt: time, updatedAt: time });

/**
 * Realistic data of every block for the 14 days ending `today`, plus an IELTS exam in 5 days.
 * Nothing is dated after `now` (loaded early in the morning, today has no sleep or meals yet). Pure: the caller loads it through `importAll`.
 */
export function buildDemoTables(today: DateKey, now: Millis): DemoTables {
  const rnd = random(Number(today.replaceAll('-', '')));
  const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
  const days = Array.from({ length: DEMO_DAYS }, (_, i) => shiftDateKey(today, i - (DEMO_DAYS - 1)));
  const first = days[0];
  const past = <T extends { at: Millis }>(rows: T[]) => rows.filter((r) => r.at <= now);
  /** Record stamps never lie in the future (e.g. today's evening habit log when loaded in the morning). */
  const stamp = (id: string, time: Millis) => base(id, Math.min(time, now));

  // ---------- tasks ----------
  const projects: Project[] = [
    { ...stamp('project-study', at(first, 8)), name: 'Учёба', color: '#6366f1', archived: false },
    { ...stamp('project-work', at(first, 8)), name: 'Работа', color: '#0ea5e9', archived: false },
    { ...stamp('project-home', at(first, 8)), name: 'Дом', color: '#10b981', archived: false },
  ];
  const [study, work, home] = projects.map((p) => p.id);
  const task = (n: number, title: string, fields: Partial<Task> & { dueIn?: number; doneIn?: number } = {}): Task => {
    const { dueIn, doneIn, ...rest } = fields;
    return {
      ...stamp(`task-${n}`, at(first, 9)),
      title,
      priority: 3,
      tags: [],
      ...(dueIn === undefined ? {} : { dueDate: shiftDateKey(today, dueIn) }),
      ...(doneIn === undefined ? {} : { completedAt: at(shiftDateKey(today, doneIn), 18) }),
      ...rest,
    };
  };
  const tasks: Task[] = [
    task(1, 'Пробный тест IELTS: Listening', {
      projectId: study,
      priority: 1,
      dueIn: 0,
      estimateMin: 40,
      tags: ['ielts'],
    }),
    task(2, 'Эссе Writing Task 2', { projectId: study, priority: 1, dueIn: 0, estimateMin: 60, tags: ['ielts'] }),
    task(3, 'Выучить 30 слов по теме «Environment»', {
      projectId: study,
      priority: 2,
      dueIn: 1,
      estimateMin: 30,
      tags: ['ielts'],
    }),
    task(4, 'Speaking: записать ответы Part 2', {
      projectId: study,
      priority: 2,
      dueIn: 2,
      estimateMin: 45,
      tags: ['ielts'],
    }),
    task(5, 'Полный пробный тест IELTS', {
      projectId: study,
      priority: 1,
      dueIn: 3,
      estimateMin: 180,
      tags: ['ielts'],
    }),
    task(6, 'Reading: 2 текста на время', {
      projectId: study,
      priority: 2,
      dueIn: -2,
      doneIn: -2,
      estimateMin: 40,
      tags: ['ielts'],
    }),
    task(7, 'Грамматика: условные предложения', { projectId: study, dueIn: -5, doneIn: -5, estimateMin: 30 }),
    task(8, 'Отчёт за неделю', { projectId: work, priority: 2, dueIn: 0, dueTime: '17:00', estimateMin: 45 }),
    task(9, 'Созвон с командой', { projectId: work, dueIn: -1, dueTime: '11:00', doneIn: -1, estimateMin: 30 }),
    task(10, 'Ответить на письма', { projectId: work, priority: 4, dueIn: -3, estimateMin: 20 }),
    task(11, 'Подготовить презентацию', { projectId: work, priority: 2, dueIn: 6, estimateMin: 90 }),
    task(12, 'Оплатить интернет', {
      projectId: home,
      priority: 2,
      dueIn: -4,
      doneIn: -4,
      estimateMin: 10,
    }),
    task(13, 'Купить продукты на неделю', { projectId: home, dueIn: 1, estimateMin: 40 }),
    task(14, 'Уборка', {
      projectId: home,
      priority: 4,
      dueIn: (6 - fromDateKey(today).getDay()) % 7 || 7, // next Saturday, as the weekly rule says
      estimateMin: 60,
      recurrence: { kind: 'weekly', weekdays: [6] },
    }),
    task(15, 'Записаться к стоматологу', { priority: 3 }),
    task(16, 'Почитать про технику Помодоро', { priority: 4, tags: ['идея'] }),
  ];

  // ---------- habits ----------
  const habits: Habit[] = [
    {
      ...stamp('habit-exercise', at(first, 8)),
      name: 'Зарядка',
      schedule: { kind: 'daily' },
      archived: false,
      color: '#f59e0b',
    },
    { ...stamp('habit-reading', at(first, 8)), name: 'Чтение 20 минут', schedule: { kind: 'daily' }, archived: false },
    {
      ...stamp('habit-english', at(first, 8)),
      name: 'Английский 30 минут',
      schedule: { kind: 'weekdays', weekdays: [1, 2, 3, 4, 5] },
      archived: false,
      color: '#6366f1',
    },
    {
      ...stamp('habit-run', at(first, 8)),
      name: 'Пробежка',
      schedule: { kind: 'timesPerWeek', timesPerWeek: 3 },
      archived: false,
    },
  ];
  const habitLogs: HabitLog[] = [];
  days.forEach((day, i) => {
    const isToday = day === today;
    const weekday = fromDateKey(day).getDay();
    const done = (habit: Habit, chance: number) => {
      if (rnd() < chance)
        habitLogs.push({
          ...stamp(`habitlog-${habit.id}-${day}`, at(day, 21)),
          habitId: habit.id,
          date: day,
          done: true,
        });
    };
    // Today only the morning exercise is done so far: the rest is still to do.
    // Every day has at least one habit done, so the history has no empty days.
    done(habits[0], isToday || i % 5 !== 2 ? 1 : 0);
    if (isToday) return;
    done(habits[1], i % 5 === 2 ? 1 : 0.7);
    if (weekday >= 1 && weekday <= 5) done(habits[2], 0.85);
    if (i % 2 === 0) done(habits[3], 0.9);
  });

  // ---------- time ----------
  const timeCategories: TimeCategory[] = [
    { ...stamp('cat-study', at(first, 8)), name: 'Учёба', color: '#6366f1', archived: false },
    { ...stamp('cat-work', at(first, 8)), name: 'Работа', color: '#0ea5e9', archived: false },
    { ...stamp('cat-sport', at(first, 8)), name: 'Спорт', color: '#10b981', archived: false },
    { ...stamp('cat-rest', at(first, 8)), name: 'Отдых', color: '#f59e0b', archived: false },
  ];
  const [catStudy, catWork, catSport, catRest] = timeCategories.map((c) => c.id);
  const timeEntries: TimeEntry[] = past(
    days.flatMap((day, i) => {
      const weekend = [0, 6].includes(fromDateKey(day).getDay());
      const plan: PlannedEntry[] = [
        [catStudy, 8, int(0, 20), int(40, 90), 'pomodoro', i % 3 === 0 ? 'demo-task-1' : undefined],
      ];
      if (!weekend) plan.push([catWork, 11, int(0, 30), int(120, 200), 'timer']);
      if (i % 2 === 0) plan.push([catSport, 19, int(0, 15), int(30, 50), 'manual']);
      plan.push([catRest, 21, int(0, 30), int(30, 70), 'timer']);
      return plan.map(([categoryId, hour, minute, duration, source, taskId], k) => {
        const start = at(day, hour, minute);
        return {
          ...stamp(`time-${day}-${k}`, start),
          categoryId,
          ...(taskId ? { taskId } : {}),
          start,
          end: start + duration * 60_000,
          date: day,
          source,
          at: start + duration * 60_000,
        };
      });
    }),
  ).map(({ at: _at, ...e }) => e);

  // ---------- health ----------
  const sleepLogs: SleepLog[] = past(
    days.map((day) => {
      const bedtime = at(shiftDateKey(day, -1), 23, int(-30, 75));
      const wakeTime = at(day, 7, int(-30, 45));
      const hours = (wakeTime - bedtime) / 3_600_000;
      const quality = Math.max(1, Math.min(5, Math.round(hours - 3 + rnd())));
      return { ...stamp(`sleep-${day}`, wakeTime), date: day, bedtime, wakeTime, quality, at: wakeTime };
    }),
  ).map(({ at: _at, ...s }) => s);

  const food = (id: string, name: string, kcal: number, protein: number, fat: number, carbs: number): Food => ({
    ...stamp(`food-${id}`, at(first, 8)),
    name,
    kcal,
    protein,
    fat,
    carbs,
    source: 'custom',
  });
  const foods: Food[] = [
    food('oatmeal', 'Овсянка на молоке', 102, 3.2, 4.1, 14.2),
    food('eggs', 'Яйцо куриное', 157, 12.7, 11.5, 0.7),
    food('chicken', 'Куриная грудка', 165, 31, 3.6, 0),
    food('rice', 'Рис отварной', 116, 2.2, 0.5, 24.9),
    food('buckwheat', 'Гречка отварная', 110, 4.2, 1.1, 21.3),
    food('salad', 'Салат из овощей', 45, 1.2, 2.5, 4.5),
    food('cottage', 'Творог 5%', 121, 17.2, 5, 1.8),
    food('apple', 'Яблоко', 47, 0.4, 0.4, 9.8),
    food('bread', 'Хлеб цельнозерновой', 247, 13, 3.4, 41),
  ];
  const f = Object.fromEntries(foods.map((x) => [x.id.replace('demo-food-', ''), x.id]));
  const mealLogs: MealLog[] = past(
    days.flatMap((day) => {
      const meal = (kind: MealLog['kind'], hour: number, items: [string, number][]) => {
        const time = at(day, hour, int(0, 40));
        return {
          ...stamp(`meal-${day}-${kind}`, time),
          date: day,
          time,
          kind,
          items: items.map(([id, grams]) => ({ foodId: f[id], grams })),
          at: time,
        };
      };
      return [
        meal(
          'breakfast',
          8,
          rnd() < 0.5
            ? [
                ['oatmeal', int(200, 300)],
                ['apple', 150],
              ]
            : [
                ['eggs', 110],
                ['bread', 60],
              ],
        ),
        meal('lunch', 13, [
          [rnd() < 0.5 ? 'rice' : 'buckwheat', int(150, 250)],
          ['chicken', int(120, 180)],
          ['salad', 150],
        ]),
        meal('snack', 16, [['cottage', int(150, 200)]]),
        meal('dinner', 19, [
          ['buckwheat', int(120, 180)],
          ['salad', 200],
        ]),
      ];
    }),
  ).map(({ at: _at, ...m }) => m);

  const workout = (dayAgo: number, type: string, durationMin: number, rpe: number, extra: Partial<WorkoutLog> = {}) => {
    const day = shiftDateKey(today, -dayAgo);
    return { ...stamp(`workout-${day}`, at(day, 19, 50)), date: day, type, durationMin, rpe, ...extra };
  };
  const workoutLogs: WorkoutLog[] = [
    workout(13, 'Бег', 35, 6),
    workout(11, 'Силовая', 55, 7, {
      exercises: [
        {
          name: 'Присед',
          sets: [
            { reps: 8, weightKg: 60 },
            { reps: 8, weightKg: 60 },
            { reps: 6, weightKg: 65 },
          ],
        },
        {
          name: 'Жим лёжа',
          sets: [
            { reps: 8, weightKg: 45 },
            { reps: 8, weightKg: 45 },
          ],
        },
      ],
    }),
    workout(9, 'Бег', 40, 6),
    workout(7, 'Йога', 30, 3, { note: 'Растяжка после работы' }),
    workout(5, 'Силовая', 50, 7, {
      exercises: [
        {
          name: 'Становая тяга',
          sets: [
            { reps: 5, weightKg: 80 },
            { reps: 5, weightKg: 80 },
          ],
        },
      ],
    }),
    workout(3, 'Бег', 30, 5),
    workout(1, 'Йога', 25, 2),
  ];

  // ---------- cognition & check-ins ----------
  const cognitiveTests: CognitiveTest[] = days
    .filter((_, i) => i % 3 === 1)
    .map((day) => {
      const startedAt = at(day, 9, 15);
      const reactionTimesMs = Array.from({ length: 20 }, () => int(230, 420)).concat(int(510, 640));
      const sorted = [...reactionTimesMs].sort((a, b) => a - b);
      return {
        ...stamp(`pvt-${day}`, startedAt),
        date: day,
        kind: 'pvt' as const,
        startedAt,
        durationMs: 180_000,
        reactionTimesMs,
        lapses: reactionTimesMs.filter((ms) => ms > 500).length,
        falseStarts: int(0, 2),
        medianRtMs: sorted[Math.floor(sorted.length / 2)],
      };
    })
    .filter((t) => t.startedAt + t.durationMs <= now);

  const checkIns: CheckIn[] = days.map((day, i) => ({
    ...stamp(`checkin-${day}`, at(day, 9)),
    date: day,
    energy: int(2, 5),
    focus: int(2, 5),
    ...(i === DEMO_DAYS - 3 ? { note: 'Плохо спал, много кофе' } : {}),
  }));

  // ---------- events ----------
  const lifeEvents: LifeEvent[] = [
    {
      ...stamp('event-ielts', at(first, 10)),
      title: 'IELTS',
      type: 'exam',
      date: shiftDateKey(today, DEMO_EVENT_IN_DAYS),
      time: '09:00',
      importance: 3,
      projectId: study,
      prepDays: 7,
    },
  ];

  return {
    projects,
    tasks,
    habits,
    habitLogs,
    timeCategories,
    timeEntries,
    sleepLogs,
    foods,
    mealLogs,
    workoutLogs,
    checkIns,
    cognitiveTests,
    lifeEvents,
    settings: [],
  };
}
