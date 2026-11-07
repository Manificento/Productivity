import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { ALARM_TEXTS } from '../../../core/platform';
import { mockAlarm, mockNativePlatform, mockNightSensors } from '../../../test/platform';
import { loadAlarmState, recordDismissal } from '../data/alarm';
import { AlarmBackground } from './AlarmBackground';
import { ALARM_WEB_TEXT } from './AlarmCard';
import { SleepTab } from './SleepTab';

const TODAY = '2026-11-07';
const NOW = new Date(2026, 10, 7, 22, 0).getTime(); // evening: tomorrow's window 6:30–7:00
const WINDOW_START = new Date(2026, 10, 8, 6, 30).getTime();
const WAKE = new Date(2026, 10, 8, 7, 0).getTime();

beforeEach(async () => {
  await Promise.all([db.settings.clear(), db.sleepLogs.clear()]);
  window.location.hash = '';
  // Wake-up target 07:00 with the default 30-minute window.
  await db.settings.put({ key: 'adaptation.baseline', value: { wakeTime: '07:00' } });
  // The whole clock is fixed (Date.now and new Date — `useTodayKey` reads the latter); timers stay real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('alarm card on «Сон» (#129)', () => {
  it('Given wakeTime и wakeWindowMin When я открываю «Сон» на нативе Then карточка будильника: окно «6:30–7:00», включить / выключить', async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    render(<SleepTab today={TODAY} />);
    expect(await screen.findByText('6:30–7:00')).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'Будильник' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Будильник' })).toHaveAttribute('aria-checked', 'true'),
    );
    expect(alarm.scheduled).toEqual({ at: WAKE, windowMin: 30 });

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
    await waitFor(() => expect(alarm.scheduled).toEqual({ at: WAKE, windowMin: 30 }));
    expect(await loadAlarmState()).toEqual({ enabled: true, at: WAKE, windowMin: 30 });

    // It rings with the app closed; the user switches it off on the alarm screen.
    await act(async () => alarm.dismiss(WINDOW_START + 120_000));
    await waitFor(async () => expect((await db.settings.get('health.alarm.dismissal'))?.value).toBeDefined());
  });

  it('Given звонит будильник When я нажимаю «Выключить» Then открывается LifeOS на «Сне» (#/health)', async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    await db.settings.put({ key: 'health.alarm', value: { enabled: true, at: WINDOW_START } });
    window.location.hash = '#/tasks';
    render(<AlarmBackground />);
    vi.setSystemTime(WINDOW_START + 60_000);
    await act(async () => alarm.dismiss(WINDOW_START + 60_000));
    await waitFor(() => expect(window.location.hash).toBe('#/health'));
  });

  it('an old switch-off picked up later does not move the user to «Сон»', async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    window.location.hash = '#/tasks';
    render(<AlarmBackground />);
    await act(async () => alarm.dismiss(NOW - 2 * 86_400_000));
    await waitFor(async () => expect((await db.settings.get('health.alarm.dismissal'))?.value).toBeDefined());
    expect(window.location.hash).toBe('#/tasks');
  });

  it('a mounted background sets the next window after the alarm rings and is switched off', async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    await db.settings.put({ key: 'health.alarm', value: { enabled: true, at: WINDOW_START } });
    render(<AlarmBackground />);
    await waitFor(() => expect(alarm.bridge.set).toHaveBeenCalled()); // app start: set again (forced)

    // Morning: the alarm rang at 6:30 and is switched off at 6:33 with the app still running.
    vi.setSystemTime(WINDOW_START + 3 * 60_000);
    await act(async () => alarm.dismiss(WINDOW_START + 3 * 60_000));
    const nextDay = new Date(2026, 10, 9, 7, 0).getTime();
    await waitFor(() => expect(alarm.scheduled).toEqual({ at: nextDay, windowMin: 30 }));
    expect(await loadAlarmState()).toMatchObject({ enabled: true, at: nextDay, windowMin: 30 });
  });

  it("the app opened inside the window before it rang keeps today's alarm", async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    await db.settings.put({ key: 'health.alarm', value: { enabled: true, at: WAKE, windowMin: 30 } });
    vi.setSystemTime(WINDOW_START + 10 * 60_000); // 6:40, nothing rang yet
    render(<AlarmBackground />);
    await act(async () => window.dispatchEvent(new Event('focus')));
    await new Promise((r) => setTimeout(r, 50));
    expect(alarm.bridge.set).not.toHaveBeenCalled();
    expect(await loadAlarmState()).toMatchObject({ at: WAKE });
  });

  it('a switch-off stops the night recording (the buffer stays for «Я встал»)', async () => {
    mockNativePlatform('android', ['alarms', 'backgroundSensors']);
    const alarm = mockAlarm();
    const sensors = mockNightSensors('granted');
    sensors.running = true;
    sensors.buffer.push({
      minuteStart: WINDOW_START,
      movement: 0.1,
      movementPeak: 0.2,
      noiseDb: -60,
      noisePeakDb: -50,
    });
    render(<AlarmBackground />);
    vi.setSystemTime(WINDOW_START + 60_000);
    await act(async () => alarm.dismiss(WINDOW_START + 60_000));
    await waitFor(() => expect(sensors.running).toBe(false));
    expect(sensors.buffer).toHaveLength(1);
  });

  it('the card shows the window the alarm is set for', async () => {
    mockNativePlatform('android', ['alarms']);
    mockAlarm();
    await db.settings.put({ key: 'health.alarm', value: { enabled: true, at: WAKE, windowMin: 30 } });
    render(<SleepTab today={TODAY} />);
    expect(await screen.findByText(/Поставлен на 8 ноября, 6:30–7:00/)).toBeInTheDocument();
  });

  it('a failed re-arm shows on the card: nothing will ring', async () => {
    mockNativePlatform('android', ['alarms']);
    mockAlarm();
    await db.settings.put({ key: 'health.alarm', value: { enabled: true, error: ALARM_TEXTS.exactDenied } });
    render(<SleepTab today={TODAY} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(ALARM_TEXTS.exactDenied);
  });

  it('a switch-off from an earlier day is dropped, not offered', async () => {
    mockNativePlatform('android', ['alarms']);
    mockAlarm();
    await recordDismissal({ dismissedAt: new Date(2026, 10, 5, 7, 2).getTime(), alarmAt: WINDOW_START });
    render(<SleepTab today={TODAY} />);
    await waitFor(async () => expect(await db.settings.get('health.alarm.dismissal')).toBeUndefined());
    expect(screen.queryByText(/Будильник выключен/)).not.toBeInTheDocument();
  });

  it('Given звонок When я нажимаю «Я встал» Then предложение записать сон через saveSleep() с подставленным временем', async () => {
    mockNativePlatform('android', ['alarms']);
    mockAlarm();
    vi.setSystemTime(new Date(2026, 10, 8, 7, 5));
    await recordDismissal({
      dismissedAt: new Date(2026, 10, 8, 7, 2).getTime(),
      alarmAt: WINDOW_START,
    });
    render(<SleepTab today="2026-11-08" />);
    expect(await screen.findByText(/Будильник выключен в 07:02/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Я встал' }));
    const form = screen.getByRole('region', { name: 'Записать сон' });
    expect(form.querySelector('input[type="time"]')).toHaveValue('23:30'); // bedtime target
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

  it('Given данные ночи When звучит будильник Then запись сна с этапами: «Я встал» сохраняет ночь с этапами из записи датчиков, очищает буфер и останавливает запись', async () => {
    mockNativePlatform('android', ['alarms', 'backgroundSensors']);
    mockAlarm();
    const sensors = mockNightSensors('granted');
    sensors.running = true;
    // The night 23:30–07:02: still until 06:40, then stirring.
    const bed = new Date(2026, 10, 7, 23, 30).getTime();
    for (let t = bed; t < new Date(2026, 10, 8, 7, 2).getTime(); t += 60_000) {
      const stir = t >= new Date(2026, 10, 8, 6, 40).getTime();
      sensors.buffer.push({
        minuteStart: t,
        movement: stir ? 0.1 : 0.01,
        movementPeak: 0.2,
        noiseDb: -60,
        noisePeakDb: -50,
      });
    }
    vi.setSystemTime(new Date(2026, 10, 8, 7, 5));
    await recordDismissal({ dismissedAt: new Date(2026, 10, 8, 7, 2).getTime(), alarmAt: WAKE });
    render(<SleepTab today="2026-11-08" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Я встал' }));
    expect(await screen.findByText(/Глубокий сон 7 ч 12 мин/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Записать сон' }));
    await waitFor(async () => expect(await db.sleepLogs.count()).toBe(1));
    const [log] = await db.sleepLogs.toArray();
    expect(log?.stages?.map((x) => x.stage)).toEqual(['deep', 'light']);
    expect(log?.stages?.[0]?.start).toBe(bed);
    await waitFor(() => expect(sensors.running).toBe(false));
    expect(sensors.buffer).toEqual([]);
  });

  it('without night data «Я встал» records the night as before, without stages', async () => {
    mockNativePlatform('android', ['alarms', 'backgroundSensors']);
    mockAlarm();
    mockNightSensors('granted');
    vi.setSystemTime(new Date(2026, 10, 8, 7, 5));
    await recordDismissal({ dismissedAt: new Date(2026, 10, 8, 7, 2).getTime(), alarmAt: WAKE });
    render(<SleepTab today="2026-11-08" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Я встал' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Записать сон' }));
    await waitFor(async () => expect(await db.sleepLogs.count()).toBe(1));
    expect((await db.sleepLogs.toArray())[0]?.stages).toBeUndefined();
  });

  it('«Записать сон» tapped at once still saves the stages: the save reads the buffer itself', async () => {
    mockNativePlatform('android', ['alarms', 'backgroundSensors']);
    mockAlarm();
    const sensors = mockNightSensors('granted');
    const bed = new Date(2026, 10, 7, 23, 30).getTime();
    for (let t = bed; t < new Date(2026, 10, 8, 7, 2).getTime(); t += 60_000)
      sensors.buffer.push({ minuteStart: t, movement: 0.01, movementPeak: 0.02, noiseDb: -60, noisePeakDb: -50 });
    vi.setSystemTime(new Date(2026, 10, 8, 7, 5));
    await recordDismissal({ dismissedAt: new Date(2026, 10, 8, 7, 2).getTime(), alarmAt: WAKE });
    render(<SleepTab today="2026-11-08" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Я встал' }));
    fireEvent.click(screen.getByRole('button', { name: 'Записать сон' })); // before the preview has loaded
    await waitFor(async () => expect((await db.sleepLogs.toArray())[0]?.stages?.length).toBeGreaterThan(0));
  });

  it('a failing clear still stops the recording; the night stays saved', async () => {
    mockNativePlatform('android', ['alarms', 'backgroundSensors']);
    mockAlarm();
    const sensors = mockNightSensors('granted');
    sensors.running = true;
    sensors.buffer.push({
      minuteStart: new Date(2026, 10, 8, 3, 0).getTime(),
      movement: 0.01,
      movementPeak: 0.02,
      noiseDb: -60,
      noisePeakDb: -50,
    });
    sensors.bridge.clearSamples.mockRejectedValueOnce(new Error('disk'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.setSystemTime(new Date(2026, 10, 8, 7, 5));
    await db.settings.put({
      key: 'health.alarm.dismissal',
      value: { dismissedAt: new Date(2026, 10, 8, 7, 2).getTime(), alarmAt: WAKE },
    });
    render(<SleepTab today="2026-11-08" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Я встал' }));
    fireEvent.click(screen.getByRole('button', { name: 'Записать сон' }));
    await waitFor(async () => expect(await db.sleepLogs.count()).toBe(1));
    await waitFor(() => expect(sensors.running).toBe(false));
  });
});
