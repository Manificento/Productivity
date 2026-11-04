import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import * as sleepModule from '../../../core/logging/sleep';
import { todayModule } from '../index';
import { ONBOARDING_DONE_KEY } from '../data/onboarding';
import { applyAsyncTimeout } from '../../../test/async';

// Full screens with live queries: wait up to the shared timeout, not the default 1 s (#169).
applyAsyncTimeout();

// These tests open «Сегодня»: the first-run onboarding (#41) is already done.
beforeEach(async () => {
  await db.settings.put({ key: ONBOARDING_DONE_KEY, value: true });
});

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const base = { createdAt: 0, updatedAt: 0 };

function Location() {
  const l = useLocation();
  return <p data-testid="location">{l.pathname + l.search}</p>;
}

function renderToday() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/cognition/*" element={<Location />} />
        <Route path={todayModule.path} element={<todayModule.Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Wraps userEvent so the test can count taps. */
function tapper() {
  const user = userEvent.setup();
  let taps = 0;
  return {
    get taps() {
      return taps;
    },
    tap: async (el: Element) => {
      taps++;
      await user.click(el);
    },
    user,
  };
}

async function morning() {
  return screen.findByRole('region', { name: 'Утро: 3 минуты' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 7, 45)); // Wed 4 Nov 2026, 07:45
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all([db.sleepLogs.clear(), db.checkIns.clear(), db.cognitiveTests.clear(), db.settings.clear()]);
});

describe('Утро за 3 минуты', () => {
  it('Given утро, сон и чек-ин сегодня не заполнены When я открываю «Сегодня» Then вверху карточка «Утро: 3 минуты» с шагами сон → самочувствие → тест', async () => {
    renderToday();
    const card = await morning();
    const steps = within(card).getAllByRole('listitem');
    expect(steps.map((s) => s.querySelector('h3')?.textContent)).toEqual(['Сон', 'Самочувствие', 'Тест внимания']);
    expect(within(card).getByText('Лёг 23:30 · встал 07:30 · качество 3/5')).toBeInTheDocument();
    const targets = await screen.findByText(/Цели дня/);
    expect(card.compareDocumentPosition(targets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Given шаг «сон» When я подтверждаю предложенные «лёг 23:30 / встал 07:30» Then сон сохраняется через saveSleep()', async () => {
    const t = tapper();
    const spy = vi.spyOn(sleepModule, 'saveSleep');
    renderToday();
    const card = await morning();
    await t.tap(within(card).getByRole('button', { name: 'Подтвердить' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await waitFor(async () =>
      expect(await db.sleepLogs.toArray()).toEqual([
        expect.objectContaining({ date: '2026-11-04', bedtime: at(3, 23, 30), wakeTime: at(4, 7, 30), quality: 3 }),
      ]),
    );
    expect(await within(card).findByText(/23:30–07:30, 8 ч/)).toBeInTheDocument();
  });

  it('Given шаг «сон» When я меняю предложенные значения Then сон сохраняется через saveSleep() и цели дня пересчитаны', async () => {
    const user = userEvent.setup();
    renderToday();
    const card = await morning();
    await user.click(within(card).getByRole('button', { name: 'Изменить' }));
    const bed = within(card).getByLabelText('Лёг');
    await user.clear(bed);
    await user.type(bed, '02:00');
    await user.click(within(card).getByRole('button', { name: 'Сохранить сон' }));
    expect(await screen.findByText(/Сон прошлой ночью 5\.5 ч/)).toBeInTheDocument();
    expect((await db.sleepLogs.toArray())[0]).toMatchObject({ bedtime: at(4, 2), wakeTime: at(4, 7, 30) });
  });

  it('shows the validation message of saveSleep for an impossible night', async () => {
    const user = userEvent.setup();
    renderToday();
    const card = await morning();
    await user.click(within(card).getByRole('button', { name: 'Изменить' }));
    const bed = within(card).getByLabelText('Лёг');
    await user.clear(bed);
    await user.type(bed, '07:25');
    await user.click(within(card).getByRole('button', { name: 'Сохранить сон' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('Сон короче 15 минут');
    expect(await db.sleepLogs.count()).toBe(0);
  });

  it('suggests the times of the last logged night', async () => {
    await db.sleepLogs.add({
      id: 's',
      date: '2026-11-03',
      bedtime: at(2, 23),
      wakeTime: at(3, 6, 45),
      quality: 4,
      ...base,
    });
    renderToday();
    expect(await within(await morning()).findByText('Лёг 23:00 · встал 06:45 · качество 4/5')).toBeInTheDocument();
  });

  it('Given шаг «самочувствие» When я ставлю энергию и фокус Then сохраняется чек-ин дня', async () => {
    const user = userEvent.setup();
    renderToday();
    const card = await morning();
    const feel = within(card).getByRole('region', { name: 'Самочувствие' });
    await user.click(await within(feel).findByRole('radio', { name: 'Энергия: 4' }));
    await user.click(within(feel).getByRole('radio', { name: 'Фокус: 3' }));
    await user.click(within(feel).getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () =>
      expect(await db.checkIns.toArray()).toEqual([
        expect.objectContaining({ date: '2026-11-04', energy: 4, focus: 3 }),
      ]),
    );
  });

  it('Given шаг «тест» When я нажимаю «Пройти тест» Then открывается /cognition/pvt?return=/; можно «Пропустить»', async () => {
    const user = userEvent.setup();
    renderToday();
    const card = await morning();
    expect(within(card).getByRole('button', { name: 'Пропустить тест' })).toBeInTheDocument();
    await user.click(within(card).getByRole('link', { name: 'Пройти тест' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/cognition/pvt?return=/');
  });

  it('Given все шаги пройдены или пропущены When я возвращаюсь Then карточка сворачивается в строку «Утро ✓» и цели дня пересчитаны', async () => {
    await db.sleepLogs.add({ id: 's', date: '2026-11-04', bedtime: at(4, 2), wakeTime: at(4, 7), quality: 2, ...base });
    await db.checkIns.add({ id: 'c', date: '2026-11-04', energy: 2, focus: 3, ...base });
    await db.cognitiveTests.add({
      id: 't',
      date: '2026-11-04',
      kind: 'pvt',
      startedAt: 0,
      durationMs: 60_000,
      reactionTimesMs: [300],
      lapses: 0,
      falseStarts: 0,
      medianRtMs: 300,
      ...base,
    });
    renderToday();
    const row = await screen.findByRole('button', { name: /Утро ✓/ });
    expect(screen.queryByRole('region', { name: 'Утро: 3 минуты' })).not.toBeInTheDocument();
    // The reasons come from the daily targets — a separate live query from the morning row: wait for them too.
    expect(await screen.findByText(/Сон прошлой ночью 5/)).toBeInTheDocument();
    expect(await screen.findByText(/Низкая энергия/)).toBeInTheDocument();

    await userEvent.setup().click(row);
    expect(screen.getByRole('region', { name: 'Утро: 3 минуты' })).toBeInTheDocument();
  });

  it('Given поток пройден без раздумий When считается число тапов Then не больше 6 тапов при согласии с предложенными значениями', async () => {
    const t = tapper();
    renderToday();
    const card = await morning();
    await t.tap(within(card).getByRole('button', { name: 'Подтвердить' }));
    const feel = within(card).getByRole('region', { name: 'Самочувствие' });
    await t.tap(await within(feel).findByRole('radio', { name: 'Энергия: 3' }));
    await t.tap(within(feel).getByRole('radio', { name: 'Фокус: 3' }));
    await t.tap(within(feel).getByRole('button', { name: 'Сохранить' }));
    await t.tap(await within(card).findByRole('button', { name: 'Пропустить тест' }));

    expect(await screen.findByRole('button', { name: /Утро ✓/ })).toBeInTheDocument();
    expect(t.taps).toBeLessThanOrEqual(6);
  });

  it('lets me skip sleep and the check-in too', async () => {
    const user = userEvent.setup();
    renderToday();
    const card = await morning();
    await user.click(within(card).getByRole('button', { name: 'Пропустить сон' }));
    await user.click(await within(card).findByRole('button', { name: 'Пропустить самочувствие' }));
    await user.click(await within(card).findByRole('button', { name: 'Пропустить тест' }));
    expect(await screen.findByRole('button', { name: /Утро ✓/ })).toBeInTheDocument();
    expect(await db.sleepLogs.count()).toBe(0);
  });

  it('Given ночь ещё идёт (00:30) When я открываю «Сегодня» Then утренний поток ещё закрыт', async () => {
    vi.setSystemTime(new Date(2026, 10, 4, 0, 30));
    renderToday();
    expect(await screen.findByText(/Утренний поток откроется в 04:00/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Утро: 3 минуты' })).not.toBeInTheDocument();
  });

  it('never saves a wake-up from the future with one tap', async () => {
    vi.setSystemTime(new Date(2026, 10, 4, 6, 52));
    const user = userEvent.setup();
    renderToday();
    const card = await morning();
    expect(within(card).getByText('Лёг 23:30 · встал 06:50 · качество 3/5')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Изменить' }));
    const wake = within(card).getByLabelText('Встал');
    await user.clear(wake);
    await user.type(wake, '07:30');
    await user.click(within(card).getByRole('button', { name: 'Сохранить сон' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('Время подъёма ещё не наступило');
    expect(await db.sleepLogs.count()).toBe(0);
  });

  it('collapses while open as soon as the last step is done (back from the test)', async () => {
    await db.sleepLogs.add({
      id: 's',
      date: '2026-11-04',
      bedtime: at(3, 23),
      wakeTime: at(4, 7),
      quality: 3,
      ...base,
    });
    await db.checkIns.add({ id: 'c', date: '2026-11-04', energy: 3, focus: 3, ...base });
    renderToday();
    expect(await morning()).toBeInTheDocument();
    await db.cognitiveTests.add({
      id: 't',
      date: '2026-11-04',
      kind: 'pvt',
      startedAt: 0,
      durationMs: 60_000,
      reactionTimesMs: [300],
      lapses: 0,
      falseStarts: 0,
      medianRtMs: 300,
      ...base,
    });
    expect(await screen.findByRole('button', { name: /Утро ✓/ })).toBeInTheDocument();
  });

  it('edits the saved night, not the suggestion', async () => {
    const user = userEvent.setup();
    await db.sleepLogs.add({ id: 's', date: '2026-11-04', bedtime: at(4, 1), wakeTime: at(4, 7), quality: 2, ...base });
    renderToday();
    const card = await morning();
    await user.click(await within(card).findByRole('button', { name: 'Изменить' }));
    expect(within(card).getByLabelText('Лёг')).toHaveValue('01:00');
    expect(within(card).getByLabelText('Встал')).toHaveValue('07:00');
    expect(within(card).getByRole('radio', { name: 'Качество сна: 2' })).toHaveAttribute('aria-checked', 'true');
  });
});
