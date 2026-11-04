import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import type { LifeEvent } from '../../../core/types';
import { todayModule } from '../index';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={todayModule.path} element={<todayModule.Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

function event(over: Partial<LifeEvent>): LifeEvent {
  return {
    id: 'e1',
    title: 'IELTS',
    type: 'exam',
    date: '2026-11-09',
    importance: 3,
    prepDays: 7,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 10, 0)); // 4 Nov 2026, local time
  await db.projects.add({ id: 'english', name: 'Английский', archived: false, createdAt: 0, updatedAt: 0 });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all([db.lifeEvents.clear(), db.projects.clear()]);
});

describe('События', () => {
  it('Given экран «События» When я создаю IELTS: тип exam, дата, важность 3, проект «Английский», 7 дней подготовки Then событие сохраняется и видно в списке', async () => {
    const user = userEvent.setup();
    renderAt('/today/events');
    expect(await screen.findByText(/Пока нет событий/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Добавить событие/ }));
    const dialog = screen.getByRole('dialog', { name: 'Новое событие' });
    await user.type(within(dialog).getByLabelText('Название'), 'IELTS');
    await user.selectOptions(within(dialog).getByLabelText('Тип'), 'exam');
    await user.clear(within(dialog).getByLabelText('Дата'));
    await user.type(within(dialog).getByLabelText('Дата'), '2026-11-09');
    await user.click(within(dialog).getByRole('radio', { name: 'Критичное' }));
    await user.selectOptions(await within(dialog).findByLabelText('Проект'), 'Английский');
    await user.clear(within(dialog).getByLabelText('Дней подготовки'));
    await user.type(within(dialog).getByLabelText('Дней подготовки'), '7');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    const upcoming = await screen.findByRole('region', { name: 'Предстоящие' });
    expect(await within(upcoming).findByRole('link', { name: /IELTS/ })).toHaveTextContent('через 5 дней');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const saved = await db.lifeEvents.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      title: 'IELTS',
      type: 'exam',
      date: '2026-11-09',
      importance: 3,
      projectId: 'english',
      prepDays: 7,
    });
  });

  it('shows validation errors and does not save an event without a title', async () => {
    const user = userEvent.setup();
    renderAt('/today/events');
    await user.click(await screen.findByRole('button', { name: /Добавить событие/ }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Введите название');
    expect(await db.lifeEvents.count()).toBe(0);
  });

  it('Given дата в прошлом больше чем на день When список отображается Then событие в разделе «Прошедшие»', async () => {
    await db.lifeEvents.bulkAdd([
      event({ id: 'old', title: 'Сессия', date: '2026-11-01' }),
      event({ id: 'soon', title: 'IELTS', date: '2026-11-09' }),
    ]);
    renderAt('/today/events');
    const past = await screen.findByRole('region', { name: 'Прошедшие' });
    expect(within(past).getByRole('link', { name: /Сессия/ })).toBeInTheDocument();
    expect(within(past).queryByRole('link', { name: /IELTS/ })).not.toBeInTheDocument();
    const upcoming = screen.getByRole('region', { name: 'Предстоящие' });
    expect(within(upcoming).getByRole('link', { name: /IELTS/ })).toBeInTheDocument();
  });

  it('Given событие через 5 дней When я открываю его Then вижу таймлайн «подготовка → разгрузка → событие → восстановление» и текущую позицию', async () => {
    const user = userEvent.setup();
    await db.lifeEvents.add(event({ projectId: 'english' }));
    renderAt('/today/events');
    await user.click(await screen.findByRole('link', { name: /IELTS/ }));

    expect(await screen.findByRole('heading', { name: 'IELTS' })).toBeInTheDocument();
    const timeline = screen.getByRole('list', { name: 'Таймлайн' });
    const steps = within(timeline).getAllByRole('listitem');
    expect(steps.map((s) => s.textContent)).toEqual([
      expect.stringContaining('Подготовка'),
      expect.stringContaining('Разгрузка'),
      expect.stringContaining('Событие'),
      expect.stringContaining('Восстановление'),
    ]);
    expect(steps[0]).toHaveAttribute('aria-current', 'step');
    expect(steps[1]).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Сейчас: подготовка · событие через 5 дней')).toBeInTheDocument();
    expect(screen.getByText('Английский')).toBeInTheDocument();
  });

  it('Given событие When я редактирую его Then изменения в БД', async () => {
    const user = userEvent.setup();
    await db.lifeEvents.add(event({}));
    renderAt('/today/events/e1');
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    const dialog = screen.getByRole('dialog', { name: 'Изменить событие' });
    expect(within(dialog).getByLabelText('Название')).toHaveValue('IELTS');
    await user.clear(within(dialog).getByLabelText('Название'));
    await user.type(within(dialog).getByLabelText('Название'), 'IELTS Academic');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('heading', { name: 'IELTS Academic' })).toBeInTheDocument();
    expect(await db.lifeEvents.get('e1')).toMatchObject({ title: 'IELTS Academic', createdAt: 0 });
  });

  it('Given событие When я удаляю его с подтверждением Then оно удалено из БД', async () => {
    const user = userEvent.setup();
    await db.lifeEvents.add(event({}));
    renderAt('/today/events/e1');
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить событие?' });

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(await db.lifeEvents.get('e1')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Удалить событие?' })).getByRole('button', { name: 'Удалить' }),
    );

    expect(await screen.findByText(/Пока нет событий/)).toBeInTheDocument();
    expect(await db.lifeEvents.get('e1')).toBeUndefined();
  });

  it('shows a not-found state for a missing event', async () => {
    renderAt('/today/events/missing');
    expect(await screen.findByText('Событие не найдено')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Все события' })).toBeInTheDocument();
  });

  it('links to events from the Today screen', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: /События/ })).toHaveAttribute('href', '/today/events');
  });

  it('shows an error when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(db.lifeEvents, 'add').mockRejectedValueOnce(new Error('quota'));
    renderAt('/today/events');
    await user.click(await screen.findByRole('button', { name: /Добавить событие/ }));
    await user.type(screen.getByLabelText('Название'), 'IELTS');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить событие');
    expect(screen.getByRole('dialog', { name: 'Новое событие' })).toBeInTheDocument();
  });

  it('shows an error when deleting fails', async () => {
    const user = userEvent.setup();
    await db.lifeEvents.add(event({}));
    vi.spyOn(db.lifeEvents, 'delete').mockRejectedValueOnce(new Error('locked'));
    renderAt('/today/events/e1');
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить событие?' });
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Не удалось удалить событие');
    expect(await db.lifeEvents.get('e1')).toBeDefined();
  });

  it('keeps showing a linked project after it is archived', async () => {
    const user = userEvent.setup();
    await db.projects.add({ id: 'old', name: 'Старый проект', archived: true, createdAt: 0, updatedAt: 0 });
    await db.lifeEvents.add(event({ projectId: 'old' }));
    renderAt('/today/events/e1');
    expect(await screen.findByText('Старый проект')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    expect(screen.getByLabelText('Проект')).toHaveDisplayValue('Старый проект');
  });

  it('hides archived projects from the choice for a new event', async () => {
    const user = userEvent.setup();
    await db.projects.add({ id: 'old', name: 'Старый проект', archived: true, createdAt: 0, updatedAt: 0 });
    renderAt('/today/events');
    await user.click(await screen.findByRole('button', { name: /Добавить событие/ }));
    const select = await screen.findByLabelText('Проект');
    await within(select).findByRole('option', { name: 'Английский' });
    expect(within(select).queryByRole('option', { name: 'Старый проект' })).not.toBeInTheDocument();
  });

  it('sends unknown addresses back to the Today screen', async () => {
    renderAt('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
  });
});
