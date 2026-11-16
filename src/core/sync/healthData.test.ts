import { describe, expect, it } from 'vitest';
import { TABLE_NAMES } from '../db';
import { HEALTH_SETTING_PREFIXES, HEALTH_TABLES, isHealthData } from './healthData';

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
    for (const key of ['adaptation.baseline', 'time.pomodoro', 'healthy', 'nutritionist', 'theme', 42, undefined]) {
      expect(isHealthData('settings', key)).toBe(false);
    }
    // The prefix means something only in `settings`: a task with such an id is still a task.
    expect(isHealthData('tasks', 'health.alarm')).toBe(false);
  });
});
