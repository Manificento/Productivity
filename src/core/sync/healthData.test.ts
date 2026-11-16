import { describe, expect, it } from 'vitest';
import { TABLE_NAMES } from '../db';
import { BASELINE_SETTING_KEY } from '../adaptation/rules';
import { HEALTH_SETTING_KEYS, HEALTH_SETTING_PREFIXES, HEALTH_TABLES, isHealthData } from './healthData';

/** The synced tables that are NOT health data. A new table of `TABLE_NAMES` must be put here or in HEALTH_TABLES. */
const NOT_HEALTH = ['projects', 'tasks', 'timeCategories', 'timeEntries', 'lifeEvents', 'notes', 'settings'];

describe('contract #278: что такое данные о здоровье для согласия cloud_health', () => {
  it('HEALTH_TABLES — сон, чек-ины, питание, вес, тренировки и программы, тесты внимания, тренажёры ума, медитации, привычки и их отметки, опыт', () => {
    expect([...HEALTH_TABLES].toSorted()).toEqual(
      [
        'sleepLogs',
        'checkIns',
        'foods',
        'mealLogs',
        'weightLogs',
        'workoutLogs',
        'programs',
        'plannedSessions',
        'cognitiveTests',
        'mindSessions',
        'meditationSessions',
        'habits',
        'habitLogs',
        'xpEvents',
      ].toSorted(),
    );
  });

  it('каждая синхронизируемая таблица отнесена либо к здоровью, либо нет — новая таблица не останется без решения', () => {
    expect([...HEALTH_TABLES, ...NOT_HEALTH].toSorted()).toEqual([...TABLE_NAMES].toSorted());
    expect(HEALTH_TABLES.filter((table) => NOT_HEALTH.includes(table))).toEqual([]);
  });

  it('isHealthData: строки таблиц здоровья и настройки health.* и nutrition.*; проекты, задачи, время, события, заметки и остальные настройки — нет', () => {
    expect(HEALTH_SETTING_PREFIXES).toEqual(['health.', 'nutrition.']);
    for (const table of HEALTH_TABLES) expect(isHealthData(table, 'any-id')).toBe(true);
    for (const table of NOT_HEALTH) expect(isHealthData(table, 'any-id')).toBe(false);
    for (const key of ['health.alarm', 'health.import.workouts', 'nutrition.goal', 'nutrition.profile']) {
      expect(isHealthData('settings', key)).toBe(true);
    }
    for (const key of ['time.pomodoro', 'healthy', 'nutritionist', 'theme', 42, undefined]) {
      expect(isHealthData('settings', key)).toBe(false);
    }
    // The prefix means something only in `settings`: a task with such an id is still a task.
    expect(isHealthData('tasks', 'health.alarm')).toBe(false);
  });

  it('adaptation.baseline — обычный день пользователя (часы сна, отбой и подъём, предел тренировок, медитация, кофеин) — данные о здоровье: уходит только с согласием cloud_health', () => {
    expect(HEALTH_SETTING_KEYS).toEqual([BASELINE_SETTING_KEY]);
    expect(isHealthData('settings', 'adaptation.baseline')).toBe(true);
    // The key is matched exactly; the state of the device next to it is never synced at all (localOnly.ts).
    for (const key of ['adaptation.baselines', 'adaptation.morning', 'adaptation']) {
      expect(isHealthData('settings', key)).toBe(false);
    }
    expect(isHealthData('tasks', 'adaptation.baseline')).toBe(false);
  });
});
