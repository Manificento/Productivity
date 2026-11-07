import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { HEALTH_TEXTS } from '../../../core/platform';
import { mockHealthStore, mockNativePlatform } from '../../../test/platform';
import { HealthImportBackground } from './HealthImportBackground';
import { HEALTH_IMPORT_WEB_TEXT } from './HealthImportCard';
import { SleepTab } from './SleepTab';

const TODAY = '2026-11-07';
const iso = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const night = (id: string, d: number) => ({
  dataType: 'sleep' as const,
  value: 0,
  unit: 'minute' as const,
  startDate: iso(d - 1, 23),
  endDate: iso(d, 7),
  platformId: id,
  sourceId: 'com.fitbit',
  sleepState: 'asleep' as const,
});

beforeEach(async () => {
  await Promise.all([db.settings.clear(), db.sleepLogs.clear(), db.workoutLogs.clear()]);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 7, 8, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('health store import on «Сон» (#131)', () => {
  it('Given натив When я включаю импорт и даю разрешение Then сон за 30 дней записан через saveSleep(), тренировки — через saveWorkout(), без дублей при повторном импорте', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore([], { sleep: 'allow', workouts: 'allow' });
    store.sleep = [night('n-6', 6), night('n-7', 7)];
    render(<SleepTab today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Подключить' }));
    expect(await screen.findByRole('status')).toHaveTextContent('ночей 2, тренировок 0');
    expect(await db.sleepLogs.count()).toBe(2);
    fireEvent.click(await screen.findByRole('button', { name: 'Обновить' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ночей 2'));
    expect(await db.sleepLogs.count()).toBe(2);
  });

  it('Given импорт включён When я открываю приложение утром Then ночь уже записана (утренний поток видит запись за сегодня и пропускает шаг «сон»)', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.sleep = [night('n-7', 7)];
    await db.settings.put({ key: 'health.import', value: { enabled: true, lastRunAt: Date.now() - 10 * 3_600_000 } });
    render(<HealthImportBackground />);
    await waitFor(async () => expect(await db.sleepLogs.where('date').equals(TODAY).count()).toBe(1));
  });

  it('Given отказ в разрешении When я пробую импорт Then понятная ошибка и ручной ввод', async () => {
    mockNativePlatform('android', ['healthImport']);
    mockHealthStore([], { sleep: 'deny', workouts: 'deny' });
    render(<SleepTab today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Подключить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(HEALTH_TEXTS.deniedAndroid);
    expect(screen.getByText('Сон можно записать вручную ниже.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть Health Connect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить сон' })).toBeInTheDocument();
  });

  it('Given веб When я открываю настройки импорта Then «доступно в приложении для телефона»', async () => {
    render(<SleepTab today={TODAY} />);
    expect(await screen.findByText(HEALTH_IMPORT_WEB_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Подключить' })).not.toBeInTheDocument();
  });

  it('«Отключить» turns the import off', async () => {
    mockNativePlatform('android', ['healthImport']);
    mockHealthStore();
    await db.settings.put({ key: 'health.import', value: { enabled: true, lastRunAt: Date.now() } });
    render(<SleepTab today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Отключить' }));
    expect(await screen.findByRole('button', { name: 'Подключить' })).toBeInTheDocument();
  });
});
