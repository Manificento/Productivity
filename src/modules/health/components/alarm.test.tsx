import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { ALARM_TEXTS } from '../../../core/platform';
import { mockAlarm, mockNativePlatform } from '../../../test/platform';
import { loadAlarmState, recordDismissal } from '../data/alarm';
import { AlarmBackground } from './AlarmBackground';
import { ALARM_WEB_TEXT } from './AlarmCard';
import { SleepTab } from './SleepTab';

const TODAY = '2026-11-07';
const NOW = new Date(2026, 10, 7, 22, 0).getTime(); // evening: tomorrow's window 7:00–7:30 (default targets)
const WINDOW_START = new Date(2026, 10, 8, 7, 0).getTime();

beforeEach(async () => {
  await Promise.all([db.settings.clear(), db.sleepLogs.clear()]);
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => vi.restoreAllMocks());

describe('alarm card on «Сон» (#129)', () => {
  it('Given wakeTime и wakeWindowMin When я открываю «Сон» на нативе Then карточка будильника: окно «6:30–7:00», включить / выключить', async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    render(<SleepTab today={TODAY} />);
    expect(await screen.findByText('7:00–7:30')).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'Будильник' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Будильник' })).toHaveAttribute('aria-checked', 'true'),
    );
    expect(alarm.scheduled).toEqual({ at: WINDOW_START, windowMin: 0 });

    fireEvent.click(screen.getByRole('switch', { name: 'Будильник' }));
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Будильник' })).toHaveAttribute('aria-checked', 'false'),
    );
    expect(alarm.scheduled).toBeUndefined();
  });

  it('a refused alarm shows why and stays off', async () => {
    mockNativePlatform('android', ['alarms']);
    mockAlarm('denied');
    render(<SleepTab today={TODAY} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Будильник' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(ALARM_TEXTS.denied);
    expect(screen.getByRole('switch', { name: 'Будильник' })).toHaveAttribute('aria-checked', 'false');
  });

  it('Given будильник включён When наступает окно Then звонит в начале окна при закрытом приложении: the background keeps the next window set and stores the switch-off', async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    await db.settings.put({ key: 'health.alarm', value: { enabled: true, at: WINDOW_START - 86_400_000 } }); // rang yesterday
    render(<AlarmBackground />);
    await waitFor(() => expect(alarm.scheduled).toEqual({ at: WINDOW_START, windowMin: 0 }));
    expect(await loadAlarmState()).toEqual({ enabled: true, at: WINDOW_START });

    // It rings with the app closed; the user switches it off on the alarm screen.
    await act(async () => alarm.dismiss(WINDOW_START + 120_000));
    await waitFor(async () => expect((await db.settings.get('health.alarm.dismissal'))?.value).toBeDefined());
  });

  it('Given звонок When я нажимаю «Я встал» Then предложение записать сон через saveSleep() с подставленным временем', async () => {
    mockNativePlatform('android', ['alarms']);
    mockAlarm();
    vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 10, 8, 7, 5).getTime());
    await recordDismissal({
      dismissedAt: new Date(2026, 10, 8, 7, 2).getTime(),
      alarmAt: WINDOW_START,
    });
    render(<SleepTab today="2026-11-08" />);
    expect(await screen.findByText(/Будильник выключен в 07:02/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Я встал' }));
    const form = screen.getByRole('region', { name: 'Записать сон' });
    expect(form.querySelector('input[type="time"]')).toHaveValue('23:30');
    expect(screen.getAllByLabelText('Подъём').some((el) => (el as HTMLInputElement).value === '07:02')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Записать сон' }));
    await waitFor(async () => expect(await db.sleepLogs.count()).toBe(1));
    const [log] = await db.sleepLogs.toArray();
    expect(log).toMatchObject({ date: '2026-11-08', wakeTime: new Date(2026, 10, 8, 7, 2).getTime() });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Записать сон' })).not.toBeInTheDocument());
    expect(await db.settings.get('health.alarm.dismissal')).toBeUndefined();
  });

  it('«Не сейчас» drops the offer', async () => {
    mockNativePlatform('android', ['alarms']);
    mockAlarm();
    await recordDismissal({
      dismissedAt: new Date(2026, 10, 8, 7, 2).getTime(),
      alarmAt: WINDOW_START,
    });
    render(<SleepTab today="2026-11-08" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Не сейчас' }));
    await waitFor(() => expect(screen.queryByText(/Будильник выключен/)).not.toBeInTheDocument());
  });

  it('Given веб When я открываю карточку Then «доступно в приложении для телефона»', async () => {
    render(<SleepTab today={TODAY} />);
    expect(await screen.findByText(ALARM_WEB_TEXT)).toBeInTheDocument();
    expect(ALARM_WEB_TEXT).toMatch(/доступен в приложении для телефона/);
    expect(screen.queryByRole('switch', { name: 'Будильник' })).not.toBeInTheDocument();
  });
});
