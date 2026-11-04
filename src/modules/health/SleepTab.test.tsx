import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../core/db';
import { sleepHours } from '../../core/logging/sleepTime';
import { logSleep } from './data/sleep';
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

  it('Given records for 14 days When the screen opens Then there are SVG duration bars and the 7-day average', async () => {
    await logSleep({ wakeDay: '2026-11-04', bedtime: '23:00', wake: '07:00', quality: 3 }); // 8 h
    await logSleep({ wakeDay: '2026-11-02', bedtime: '00:00', wake: '06:00', quality: 3 }); // 6 h
    await logSleep({ wakeDay: '2026-10-25', bedtime: '23:00', wake: '09:00', quality: 3 }); // 10 h, outside 7 days
    renderTab();
    const chart = await screen.findByRole('img', { name: /Длительность сна за 14 дней/ });
    expect(within(chart.parentElement!).getAllByTestId('sleep-bar')).toHaveLength(3);
    expect(screen.getByText(/Среднее за 7 дней/)).toHaveTextContent('Среднее за 7 дней: 7 ч');
  });
});
