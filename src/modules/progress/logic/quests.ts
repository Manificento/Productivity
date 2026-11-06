import type { DailyTargets } from '../../../core/adaptation/types';
import { shiftDateKey } from '../../../core/dates';
import { isScheduled } from '../../../core/habitSchedule';
import { atLocalTime } from '../../../core/logging/sleepTime';
import type { Habit, HabitLog, MeditationSession, SleepLog, Task, TimeEntry } from '../../../core/types';
import { MIN_FOCUS_MS, XP_RULES } from './xp';

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
}

function sessionsWord(n: number): string {
  const last = n % 10;
  const tens = n % 100;
  if (last === 1 && tens !== 11) return 'фокус-сессия';
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return 'фокус-сессии';
  return 'фокус-сессий';
}

function habitsDone(targets: DailyTargets, data: QuestData, essentialOnly: boolean): boolean {
  const due = data.habits.filter(
    (h) => !h.archived && (!essentialOnly || h.essential) && isScheduled(h.schedule, targets.date),
  );
  if (due.length === 0) return false;
  const doneIds = new Set(data.habitLogs.filter((l) => l.date === targets.date && l.done).map((l) => l.habitId));
  return due.every((h) => doneIds.has(h.id));
}

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
  return log !== undefined && log.bedtime <= limit;
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
    return [
      { id: 'habits', title: 'Ключевые привычки', done: habitsDone(targets, data, true) },
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
  candidates.push({ id: 'bedtime', title: `Отбой до ${targets.bedtime}`, done: bedtimeDone(targets, data) });
  if (targets.meditationMin > 0)
    candidates.push({
      id: 'meditation',
      title: `Медитация ${targets.meditationMin} мин`,
      done: meditationMinutes(targets, data, false) >= targets.meditationMin,
    });
  candidates.push({
    id: 'habits',
    title: targets.habitsMode === 'essential' ? 'Ключевые привычки' : 'Привычки дня',
    done: habitsDone(targets, data, targets.habitsMode === 'essential'),
  });
  return candidates.slice(0, 3);
}
