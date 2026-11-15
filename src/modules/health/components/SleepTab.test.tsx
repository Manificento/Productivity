import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import * as sleepWrites from '../../../core/logging/sleep';
import { sleepHours } from '../../../core/logging/sleepTime';
import { logSleep } from '../data/sleep';
import { SleepTab } from './SleepTab';

const TODAY = '2026-11-04';

function renderTab() {
  render(
    <MemoryRouter>
      <SleepTab today={TODAY} />
    </MemoryRouter>,
  );
}

function setTime(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(async () => {
  await db.sleepLogs.clear();
});

describe('sleep tab', () => {
  it('Given I open «Сон» in the morning When the form is open Then it defaults to last night: bedtime yesterday 23:30, wake-up today 07:30', async () => {
    renderTab();
    expect(screen.getByLabelText('День подъёма')).toHaveValue(TODAY);
    expect(screen.getByLabelText('Отбой')).toHaveValue('23:30');
    expect(screen.getByLabelText('Подъём')).toHaveValue('07:30');
    expect(screen.getByText('8 ч')).toBeInTheDocument();
    expect(await screen.findByText(/Записей пока нет/)).toBeInTheDocument();
  });

  it('Given bedtime 23:30 and wake-up 07:00 When I save Then the duration is 7.5 h, date = wake-up day, and a second save updates the same record', async () => {
    renderTab();
    setTime('Подъём', '07:00');
    expect(screen.getByText('7,5 ч')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сон' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Сохранено: 7,5 ч');
    expect(await screen.findByText(/запись за этот день уже есть/)).toBeInTheDocument();

    setTime('Отбой', '00:00');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сон' }));
    expect(await screen.findByText('Сохранено: 7 ч')).toBeInTheDocument();

    const logs = await db.sleepLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].date).toBe(TODAY);
    expect(sleepHours(logs[0])).toBe(7);
  });

  it('Given wake-up earlier on the clock than bedtime When I save Then bedtime is treated as the previous evening', async () => {
    renderTab();
    setTime('Отбой', '23:00');
    setTime('Подъём', '06:00');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сон' }));
    await screen.findByText('Сохранено: 7 ч');
    const [log] = await db.sleepLogs.toArray();
    expect(new Date(log.bedtime).getDate()).toBe(3);
    expect(log.date).toBe(TODAY);
  });

  it('invalid times show an error and save nothing', async () => {
    renderTab();
    setTime('Отбой', '07:30');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сон' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Сон короче 15 минут');
    expect(await db.sleepLogs.count()).toBe(0);
  });

  it('a future wake-up day shows an error and saves nothing', async () => {
    renderTab();
    fireEvent.change(screen.getByLabelText('День подъёма'), { target: { value: '2026-11-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сон' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('День подъёма не может быть позже сегодняшнего');
    expect(await db.sleepLogs.count()).toBe(0);
  });

  it('editing the times after a save hides the stale «Сохранено» message', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сон' }));
    await screen.findByText('Сохранено: 8 ч');
    setTime('Подъём', '06:30');
    expect(screen.queryByText(/Сохранено/)).not.toBeInTheDocument();
  });

  it('Given records for 14 days When the screen opens Then there are SVG duration bars and the 7-day average', async () => {
    await logSleep({ wakeDay: '2026-11-04', bedtime: '23:00', wake: '07:00', quality: 3 }, TODAY); // 8 h
    await logSleep({ wakeDay: '2026-11-02', bedtime: '00:00', wake: '06:00', quality: 3 }, TODAY); // 6 h
    await logSleep({ wakeDay: '2026-10-25', bedtime: '23:00', wake: '09:00', quality: 3 }, TODAY); // 10 h, outside 7 days
    renderTab();
    const chart = await screen.findByRole('img', { name: /Длительность сна за 14 дней/ });
    expect(within(chart.parentElement!).getAllByTestId('sleep-bar')).toHaveLength(3);
    expect(screen.getByText(/Среднее за 7 дней/)).toHaveTextContent('Среднее за 7 дней: 7 ч');
  });

  it('Given a sleep record for a day When I delete it Then it disappears from the chart (only through deleteSleep())', async () => {
    const remove = vi.spyOn(sleepWrites, 'deleteSleep');
    await logSleep({ wakeDay: '2026-11-04', bedtime: '23:00', wake: '07:00', quality: 3 }, TODAY); // 8 h
    await logSleep({ wakeDay: '2026-11-03', bedtime: '00:00', wake: '06:00', quality: 3 }, TODAY); // 6 h
    renderTab();
    const chart = await screen.findByRole('img', { name: /записей 2/ });
    expect(screen.getByText(/Среднее за 7 дней/)).toHaveTextContent('7 ч');

    fireEvent.click(screen.getByRole('button', { name: 'Удалить запись за 4 ноября' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить запись сна?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByRole('img', { name: /записей 1/ })).toBeInTheDocument();
    expect(within(chart.parentElement!).getAllByTestId('sleep-bar')).toHaveLength(1);
    expect(screen.getByText(/Среднее за 7 дней/)).toHaveTextContent('6 ч');
    expect(screen.queryByRole('button', { name: /Удалить запись/ })).not.toBeInTheDocument();
    expect(remove).toHaveBeenCalledTimes(1);
    expect((await db.sleepLogs.toArray()).map((l) => l.date)).toEqual(['2026-11-03']);
    remove.mockRestore();
  });

  it('cancelling the deletion keeps the sleep record; a failure shows an error', async () => {
    await logSleep({ wakeDay: '2026-11-04', bedtime: '23:00', wake: '07:00', quality: 3 }, TODAY);
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить запись за 4 ноября' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await db.sleepLogs.count()).toBe(1);

    // deleteSleep() marks the record through softDelete() (contract #274), which writes the tombstone with bulkPut.
    const del = vi.spyOn(db.sleepLogs, 'bulkPut').mockRejectedValueOnce(new Error('quota'));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить запись за 4 ноября' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Не удалось удалить');
    expect(await db.sleepLogs.count()).toBe(1);
    del.mockRestore();
  });

  it('a day without a record offers no deletion', async () => {
    renderTab();
    await screen.findByText(/Записей пока нет/);
    expect(screen.queryByRole('button', { name: /Удалить запись/ })).not.toBeInTheDocument();
  });
});
