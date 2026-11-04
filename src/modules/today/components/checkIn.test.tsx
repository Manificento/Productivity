import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { todayModule } from '../index';
import { ONBOARDING_DONE_KEY } from '../data/onboarding';
import { applyAsyncTimeout } from '../../../test/async';

// Full screens with live queries: wait up to the shared timeout, not the default 1 s (#169).
applyAsyncTimeout();

// These tests open «Сегодня»: the first-run onboarding (#41) is already done.
beforeEach(async () => {
  await db.settings.put({ key: ONBOARDING_DONE_KEY, value: true });
});

function renderToday() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path={todayModule.path} element={<todayModule.Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 8, 0)); // 4 Nov 2026, local morning
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await db.checkIns.clear();
});

describe('Чек-ин', () => {
  it('Given чек-ина сегодня нет When я открываю «Сегодня» Then вверху карточка с Rating энергии и фокуса и полем заметки', async () => {
    renderToday();
    const card = await screen.findByRole('region', { name: 'Самочувствие' });
    expect(await within(card).findByRole('radiogroup', { name: 'Энергия' })).toBeInTheDocument();
    expect(within(card).getByRole('radiogroup', { name: 'Фокус' })).toBeInTheDocument();
    expect(within(card).getByLabelText('Заметка')).toBeInTheDocument();
    // The check-in comes before the daily targets.
    const targets = await screen.findByText(/Цели дня/);
    expect(card.compareDocumentPosition(targets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Given я выбираю энергию 2 When сохраняю Then создаётся CheckIn, цели дня показывают «Низкая энергия: нагрузка −20%»', async () => {
    const user = userEvent.setup();
    renderToday();
    const card = await screen.findByRole('region', { name: 'Самочувствие' });
    await user.click(await within(card).findByRole('radio', { name: 'Энергия: 2' }));
    await user.click(within(card).getByRole('radio', { name: 'Фокус: 3' }));
    await user.type(within(card).getByLabelText('Заметка'), 'плохо спал');
    await user.click(within(card).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(/Низкая энергия.*нагрузка −20%/)).toBeInTheDocument();
    expect(await db.checkIns.toArray()).toEqual([
      expect.objectContaining({ date: '2026-11-04', energy: 2, focus: 3, note: 'плохо спал' }),
    ]);
    expect(screen.getByRole('region', { name: 'Самочувствие' })).toHaveTextContent('Энергия 2/5 · фокус 3/5');
  });

  it('asks to rate both energy and focus before saving', async () => {
    const user = userEvent.setup();
    renderToday();
    const card = await screen.findByRole('region', { name: 'Самочувствие' });
    await user.click(await within(card).findByRole('radio', { name: 'Энергия: 4' }));
    await user.click(within(card).getByRole('button', { name: 'Сохранить' }));
    expect(within(card).getByRole('alert')).toHaveTextContent('Оцените энергию и фокус');
    expect(await db.checkIns.count()).toBe(0);
  });

  it('Given чек-ин уже есть When я меняю оценку Then обновляется та же запись (одна на день)', async () => {
    const user = userEvent.setup();
    await db.checkIns.add({ id: 'c1', date: '2026-11-04', energy: 2, focus: 3, createdAt: 0, updatedAt: 0 });
    renderToday();
    const card = await screen.findByRole('region', { name: 'Самочувствие' });
    expect(await within(card).findByText('Энергия 2/5 · фокус 3/5')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Изменить' }));
    expect(within(card).getByRole('radio', { name: 'Энергия: 2' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(card).getByRole('radio', { name: 'Энергия: 4' }));
    await user.click(within(card).getByRole('button', { name: 'Сохранить' }));

    expect(await within(card).findByText('Энергия 4/5 · фокус 3/5')).toBeInTheDocument();
    expect(await db.checkIns.toArray()).toEqual([expect.objectContaining({ id: 'c1', energy: 4, createdAt: 0 })]);
  });

  it('shows an error when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(db.checkIns, 'add').mockRejectedValueOnce(new Error('quota'));
    renderToday();
    const card = await screen.findByRole('region', { name: 'Самочувствие' });
    await user.click(await within(card).findByRole('radio', { name: 'Энергия: 3' }));
    await user.click(within(card).getByRole('radio', { name: 'Фокус: 3' }));
    await user.click(within(card).getByRole('button', { name: 'Сохранить' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('Не удалось сохранить чек-ин');
  });

  it('shows an error when updating fails and lets me cancel editing', async () => {
    const user = userEvent.setup();
    await db.checkIns.add({ id: 'c1', date: '2026-11-04', energy: 2, focus: 3, createdAt: 0, updatedAt: 0 });
    vi.spyOn(db.checkIns, 'put').mockRejectedValueOnce(new Error('locked'));
    renderToday();
    const card = await screen.findByRole('region', { name: 'Самочувствие' });
    await user.click(await within(card).findByRole('button', { name: 'Изменить' }));
    await user.click(within(card).getByRole('radio', { name: 'Энергия: 5' }));
    await user.click(within(card).getByRole('button', { name: 'Сохранить' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('Не удалось сохранить чек-ин');
    expect(await db.checkIns.get('c1')).toMatchObject({ energy: 2 });

    await user.click(within(card).getByRole('button', { name: 'Отмена' }));
    expect(within(card).getByText('Энергия 2/5 · фокус 3/5')).toBeInTheDocument();
  });
});
