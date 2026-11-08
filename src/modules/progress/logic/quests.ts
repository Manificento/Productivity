import type { DailyTargets } from '../../../core/adaptation/types';
import { shiftDateKey } from '../../../core/dates';
import { doneDays, isDue } from '../../../core/habitSchedule';
import { atLocalTime } from '../../../core/logging/sleepTime';
import type { Habit, HabitLog, MeditationSession, SleepLog, Task, TimeEntry } from '../../../core/types';
import { isImportedNight, MIN_FOCUS_MS, XP_RULES } from './xp';

export const QUEST_BONUS_XP = XP_RULES.quest;
/** The breathing quest of an event day. */
const BREATHING_MIN = 5;

/** Rows the quests are judged on. */
export interface QuestData {
  timeEntries: readonly TimeEntry[];
  tasks: readonly Task[];
  sleepLogs: readonly SleepLog[];
  meditationSessions: readonly MeditationSession[];
  habits: readonly Habit[];
  habitLogs: readonly HabitLog[];
}

export interface Quest {
  /** Stable key, written to `xpEvents.questId`. */
  id: string;
  title: string;
  done: boolean;
  /** Why a quest cannot be ticked yet / what to do. */
  hint?: string;
}

function sessionsWord(n: number): string {
  const last = n % 10;
  const tens = n % 100;
  if (last === 1 && tens !== 11) return 'фокус-сессия';
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return 'фокус-сессии';
  return 'фокус-сессий';
}

/** Same rule as «Привычки» / «Сегодня»: `isDue` + the latest log of a day wins (`doneDays`). */
function habitsState(targets: DailyTargets, data: QuestData, essentialOnly: boolean): { done: boolean; any: boolean } {
  const due = data.habits.filter((h) => {
    if (h.archived || (essentialOnly && !h.essential)) return false;
    return isDue(h.schedule, logsOf(h, data), targets.date);
  });
  return {
    any: data.habits.some((h) => !h.archived && (!essentialOnly || h.essential)),
    done: due.length > 0 && due.every((h) => doneDays(logsOf(h, data)).has(targets.date)),
  };
}

const logsOf = (h: Habit, data: QuestData) => data.habitLogs.filter((l) => l.habitId === h.id);

function focusDone(targets: DailyTargets, data: QuestData): boolean {
  const projectOf = new Map(data.tasks.map((t) => [t.id, t.projectId]));
  const count = data.timeEntries.filter(
    (e) =>
      e.date === targets.date &&
      e.source === 'pomodoro' &&
      e.end !== undefined &&
      e.end - e.start >= MIN_FOCUS_MS &&
      (targets.focusProjectId === undefined ||
        (e.taskId !== undefined && projectOf.get(e.taskId) === targets.focusProjectId)),
  ).length;
  return count >= targets.focusPomodoros;
}

/** Tonight's sleep is logged the next morning: it counts if bedtime was no later than the target. */
function bedtimeDone(targets: DailyTargets, data: QuestData): boolean {
  const [h] = targets.bedtime.split(':');
  // a target after midnight («01:00») belongs to the next calendar day
  const limit = atLocalTime(Number(h) < 12 ? shiftDateKey(targets.date, 1) : targets.date, targets.bedtime);
  const log = data.sleepLogs.find((l) => l.date === shiftDateKey(targets.date, 1));
  // transferred history never earns the quest retroactively (#236)
  return log !== undefined && !isImportedNight(log) && log.bedtime <= limit;
}

function meditationMinutes(targets: DailyTargets, data: QuestData, breathingOnly: boolean): number {
  return data.meditationSessions
    .filter((m) => m.date === targets.date && m.completed && (!breathingOnly || m.kind === 'breathing'))
    .reduce((sum, m) => sum + m.durationMin, 0);
}

/**
 * Daily quests from the day's targets (no rules of their own): focus, bedtime, meditation — and «привычки»
 * to fill the three when the targets drop one. On an `event` day only key habits and breathing; never training.
 */
export function questsFor(targets: DailyTargets, data: QuestData, opts: { projectName?: string } = {}): Quest[] {
  if (targets.phase === 'event') {
    const key = habitsState(targets, data, true);
    return [
      {
        id: 'habits',
        title: 'Ключевые привычки',
        done: key.done,
        ...(key.any ? {} : { hint: 'Отметьте ключевые привычки в «Привычках»' }),
      },
      {
        id: 'breathing',
        title: `Дыхание ${BREATHING_MIN} мин`,
        done: meditationMinutes(targets, data, true) >= BREATHING_MIN,
      },
    ];
  }
  const candidates: Quest[] = [];
  if (targets.focusPomodoros > 0) {
    const n = targets.focusPomodoros;
    candidates.push({
      id: 'focus',
      title: `${n} ${sessionsWord(n)}${opts.projectName ? ` на проект «${opts.projectName}»` : ''}`,
      done: focusDone(targets, data),
    });
  }
  candidates.push({
    id: 'bedtime',
    title: `Отбой до ${targets.bedtime}`,
    done: bedtimeDone(targets, data),
    hint: 'Засчитается утром по записи сна',
  });
  if (targets.meditationMin > 0)
    candidates.push({
      id: 'meditation',
      title: `Медитация ${targets.meditationMin} мин`,
      done: meditationMinutes(targets, data, false) >= targets.meditationMin,
    });
  const essential = targets.habitsMode === 'essential';
  candidates.push({
    id: 'habits',
    title: essential ? 'Ключевые привычки' : 'Привычки дня',
    done: habitsState(targets, data, essential).done,
  });
  return candidates.slice(0, 3);
}
