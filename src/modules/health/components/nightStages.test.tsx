import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { saveSleep } from '../../../core/logging/sleep';
import { mockNativePlatform, mockNightSensors } from '../../../test/platform';
import { SleepTab } from './SleepTab';

const TODAY = '2026-11-08';
const BED = new Date(2026, 10, 7, 23, 30).getTime();
const WAKE = new Date(2026, 10, 8, 7, 0).getTime();
const M = 60_000;

beforeEach(async () => {
  await Promise.all([db.settings.clear(), db.sleepLogs.clear()]);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 8, 8, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('sleep stages on «Сон» (#255)', () => {
  it('Given ночь с stages When я открываю «Сон» Then у записи видна сводка этапов и простая полоса этапов по времени, тёмная тема, подписи для экранных читалок', async () => {
    await saveSleep({
      bedtime: BED,
      wakeTime: WAKE,
      quality: 4,
      stages: [
        { start: BED, end: BED + 300 * M, stage: 'deep' },
        { start: BED + 300 * M, end: BED + 420 * M, stage: 'light' },
        { start: BED + 420 * M, end: WAKE, stage: 'awake' },
      ],
    });
    render(<SleepTab today={TODAY} />);
    const card = await screen.findByRole('region', { name: 'Этапы прошлой ночи' });
    expect(card).toHaveTextContent('Глубокий сон 5 ч 0 мин · лёгкий 2 ч 0 мин · без сна 30 мин');
    const bar = screen.getByRole('img', { name: /Этапы сна с 23:30 до 7:00/ });
    expect(bar.children).toHaveLength(3);
    expect((bar.children[0] as HTMLElement).style.width).toBe(`${(300 / 450) * 100}%`);
    expect(bar.className).toMatch(/dark:/);
  });

  it('the bar places stages by time: a recording that started late leaves the start grey', async () => {
    await saveSleep({
      bedtime: BED,
      wakeTime: WAKE,
      quality: 4,
      stages: [{ start: BED + 30 * M, end: WAKE, stage: 'deep' }],
    });
    render(<SleepTab today={TODAY} />);
    const bar = await screen.findByRole('img', { name: /Этапы сна/ });
    expect((bar.children[0] as HTMLElement).style.left).toBe(`${(30 / 450) * 100}%`);
  });

  it('a night without stages and without a recording shows no stages card', async () => {
    await saveSleep({ bedtime: BED, wakeTime: WAKE, quality: 4 });
    render(<SleepTab today={TODAY} />);
    await screen.findByText(/Сон за 14 дней/);
    expect(screen.queryByRole('region', { name: 'Этапы прошлой ночи' })).not.toBeInTheDocument();
  });

  it('Given ночь уже записана утренним потоком или импортом, а в буфере ночных датчиков есть эта ночь When я открываю «Сон» Then предложение «Добавить этапы из записи ночи», которое сохраняет этапы через saveSleep и очищает буфер', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    for (let t = BED; t < WAKE; t += M)
      sensors.buffer.push({ minuteStart: t, movement: 0.01, movementPeak: 0.02, noiseDb: -60, noisePeakDb: -50 });
    await saveSleep({ bedtime: BED, wakeTime: WAKE, quality: 4 });
    render(<SleepTab today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить этапы из записи ночи' }));
    await waitFor(async () =>
      expect((await db.sleepLogs.toArray())[0]?.stages).toEqual([{ start: BED, end: WAKE, stage: 'deep' }]),
    );
    expect((await db.sleepLogs.toArray())[0]?.quality).toBe(4);
    await waitFor(() => expect(sensors.buffer).toEqual([]));
    expect(await screen.findByText(/Глубокий сон 7 ч 30 мин/)).toBeInTheDocument();
  });

  it("adding last night's stages leaves tonight's recording running and its minutes in the buffer", async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    for (let t = BED; t < WAKE; t += M)
      sensors.buffer.push({ minuteStart: t, movement: 0.01, movementPeak: 0.02, noiseDb: -60, noisePeakDb: -50 });
    const tonight = new Date(2026, 10, 8, 22, 0).getTime();
    sensors.buffer.push({ minuteStart: tonight, movement: 0.01, movementPeak: 0.02, noiseDb: -60, noisePeakDb: -50 });
    sensors.running = true;
    await saveSleep({ bedtime: BED, wakeTime: WAKE, quality: 4 });
    render(<SleepTab today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить этапы из записи ночи' }));
    await waitFor(() => expect(sensors.buffer.map((x) => x.minuteStart)).toEqual([tonight]));
    expect(sensors.running).toBe(true);
  });

  it('nothing left to add or a failed save shows why; a failed save keeps the buffer', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    for (let t = BED; t < WAKE; t += M)
      sensors.buffer.push({ minuteStart: t, movement: 0.01, movementPeak: 0.02, noiseDb: -60, noisePeakDb: -50 });
    await saveSleep({ bedtime: BED, wakeTime: WAKE, quality: 4 });
    render(<SleepTab today={TODAY} />);
    const button = await screen.findByRole('button', { name: 'Добавить этапы из записи ночи' });
    const kept = [...sensors.buffer];
    sensors.buffer = [];
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('В записи ночи нет данных за эту ночь');

    sensors.buffer = kept;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(db.sleepLogs, 'put').mockRejectedValueOnce(new Error('disk'));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить этапы из записи ночи' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Не удалось добавить этапы — попробуйте ещё раз'),
    );
    expect(sensors.buffer).toHaveLength(kept.length);
  });

  it('a buffer from another night offers nothing', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    sensors.buffer.push({
      minuteStart: BED - 2 * 86_400_000,
      movement: 0.01,
      movementPeak: 0.02,
      noiseDb: -60,
      noisePeakDb: -50,
    });
    await saveSleep({ bedtime: BED, wakeTime: WAKE, quality: 4 });
    render(<SleepTab today={TODAY} />);
    await screen.findByText(/Сон за 14 дней/);
    await waitFor(() => expect(sensors.bridge.getSamples).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: 'Добавить этапы из записи ночи' })).not.toBeInTheDocument();
  });
});
