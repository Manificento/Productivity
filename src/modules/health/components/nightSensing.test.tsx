import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { NIGHT_SENSING_TEXTS } from '../../../core/platform';
import { mockNativePlatform, mockNightSensors } from '../../../test/platform';
import { SleepTab } from './SleepTab';

const TODAY = '2026-11-07';

beforeEach(async () => {
  await Promise.all([db.settings.clear(), db.sleepLogs.clear()]);
});

describe('«Спать» — night sensing on «Сон» (#249)', () => {
  it('Given натив, будильник включён When я нажимаю «Спать» Then фоновая служба пишет движение и уровень шума агрегатами по минутам, на карточке видно, что запись идёт, и её можно остановить', async () => {
    mockNativePlatform('android', ['backgroundSensors', 'alarms']);
    const sensors = mockNightSensors('granted');
    await db.settings.put({ key: 'health.alarm', value: { enabled: true, at: Date.now() + 8 * 3_600_000 } });
    render(<SleepTab today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Спать' }));
    expect(await screen.findByText(/Идёт запись ночи/, undefined, { timeout: 3_000 })).toBeInTheDocument();
    expect(sensors.running).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Остановить запись' }));
    expect(await screen.findByRole('button', { name: 'Спать' })).toBeInTheDocument();
    expect(sensors.running).toBe(false);
  });

  it('a night already being recorded (the app was restarted) shows as recording', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    sensors.running = true;
    render(<SleepTab today={TODAY} />);
    expect(await screen.findByText(/Идёт запись ночи/)).toBeInTheDocument();
  });

  it('Given нет доступа к микрофону When я нажимаю «Спать» Then понятное объяснение из NIGHT_SENSING_TEXTS и ручной ввод как раньше', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    mockNightSensors('prompt', 'denied');
    render(<SleepTab today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Спать' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(NIGHT_SENSING_TEXTS.denied);
    expect(screen.getByRole('button', { name: 'Сохранить сон' })).toBeInTheDocument();
  });

  it('Given веб When я открываю блок Then объяснение («трекинг сна по датчикам — в приложении для Android») и ручной ввод как раньше', async () => {
    render(<SleepTab today={TODAY} />);
    expect(await screen.findByText(NIGHT_SENSING_TEXTS.web)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Спать' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить сон' })).toBeInTheDocument();
  });

  it('a failed start says so and stays ready', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    sensors.bridge.start.mockRejectedValueOnce(new Error('service'));
    render(<SleepTab today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Спать' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(NIGHT_SENSING_TEXTS.failed);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Спать' })).toBeEnabled());
  });

  it('the service did not really start: after a moment the card says so and goes back to «Спать»', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    sensors.bridge.isActive.mockResolvedValue({ active: false });
    render(<SleepTab today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Спать' }));
    expect(await screen.findByRole('alert', undefined, { timeout: 3_000 })).toHaveTextContent(
      NIGHT_SENSING_TEXTS.failed,
    );
    expect(screen.getByRole('button', { name: 'Спать' })).toBeEnabled();
  });

  it('after «Остановить запись» the card shows stopped even while the service is still winding down', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    sensors.running = true;
    sensors.bridge.isActive.mockResolvedValueOnce({ active: true }).mockResolvedValue({ active: true });
    render(<SleepTab today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Остановить запись' }));
    expect(await screen.findByRole('button', { name: 'Спать' })).toBeInTheDocument();
  });

  it('coming back to the screen re-reads the state: a service ended at night shows as stopped', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    sensors.running = true;
    render(<SleepTab today={TODAY} />);
    await screen.findByText(/Идёт запись ночи/);
    sensors.running = false; // the OS ended it
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(await screen.findByRole('button', { name: 'Спать' })).toBeInTheDocument();
  });

  it('a native shell without the sensing plugin explains it and offers no «Спать»', async () => {
    mockNativePlatform('android', []);
    render(<SleepTab today={TODAY} />);
    expect(await screen.findByText(NIGHT_SENSING_TEXTS.nativeUnsupported)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Спать' })).not.toBeInTheDocument();
  });
});
