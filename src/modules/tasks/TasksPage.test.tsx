import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/db';
import { newRecord } from '../../core/ids';
import type { Task } from '../../core/types';
import { TasksPage } from './TasksPage';

async function seed(title: string, over: Partial<Task> = {}): Promise<Task> {
  const task = newRecord<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>({ title, priority: 4, tags: [], ...over });
  await db.tasks.add(task);
  return task;
}

function section(name: string) {
  return screen.getByRole('region', { name });
}

function findSection(name: string) {
  return screen.findByRole('region', { name });
}

// 2026-11-04 12:00 local time. Only Date is faked so userEvent and Dexie timers keep working.
const NOW = new Date(2026, 10, 4, 12, 0).getTime();

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await db.tasks.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('TasksPage', () => {
  it('Given пустой список When я ввожу «Купить молоко» в поле и нажимаю «Добавить» Then задача появляется во «Входящих» с приоритетом 4', async () => {
    const user = userEvent.setup();
    render(<TasksPage />);
    expect(await screen.findByText('Задач пока нет — добавьте первую')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Новая задача'), 'Купить молоко');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await within(section('Входящие')).findByText('Купить молоко')).toBeInTheDocument();
    const [saved] = await db.tasks.toArray();
    expect(saved).toMatchObject({ title: 'Купить молоко', priority: 4 });
    expect(saved.dueDate).toBeUndefined();
    expect(screen.getByLabelText('Новая задача')).toHaveValue('');
  });

  it('Given есть задача When я отмечаю её чекбокс Then у неё проставляется completedAt, она пропадает из активного списка и видна в «Выполненных» за сегодня', async () => {
    const user = userEvent.setup();
    const task = await seed('Купить молоко');
    render(<TasksPage />);

    await user.click(await screen.findByRole('checkbox', { name: 'Выполнено: Купить молоко' }));

    expect(within(await findSection('Выполнено сегодня')).getByText('Купить молоко')).toBeInTheDocument();
    expect(within(section('Входящие')).queryByText('Купить молоко')).not.toBeInTheDocument();
    expect((await db.tasks.get(task.id))?.completedAt).toBe(NOW);
  });

  it('Given выполненная задача When я снимаю отметку Then completedAt очищается и задача возвращается в список', async () => {
    const user = userEvent.setup();
    const task = await seed('Купить молоко', { completedAt: NOW - 60_000 });
    render(<TasksPage />);

    const box = within(await findSection('Выполнено сегодня')).getByRole('checkbox', {
      name: 'Выполнено: Купить молоко',
    });
    expect(box).toBeChecked();
    await user.click(box);

    expect(await within(section('Входящие')).findByText('Купить молоко')).toBeInTheDocument();
    expect((await db.tasks.get(task.id))?.completedAt).toBeUndefined();
  });

  it('Given есть задача When я удаляю её и подтверждаю Then она удаляется из БД', async () => {
    const user = userEvent.setup();
    const task = await seed('Купить молоко');
    render(<TasksPage />);

    await user.click(await screen.findByRole('button', { name: 'Удалить «Купить молоко»' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить задачу?' });
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByText('Задач пока нет — добавьте первую')).toBeInTheDocument();
    expect(await db.tasks.get(task.id)).toBeUndefined();
  });

  it('Given есть задача When я удаляю её без подтверждения Then она не удаляется', async () => {
    const user = userEvent.setup();
    const task = await seed('Купить молоко');
    render(<TasksPage />);

    await user.click(await screen.findByRole('button', { name: 'Удалить «Купить молоко»' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(section('Входящие')).getByText('Купить молоко')).toBeInTheDocument();
    expect(await db.tasks.get(task.id)).toBeDefined();
  });

  it('Given пустое название When я нажимаю «Добавить» Then задача не создаётся, поле показывает ошибку', async () => {
    const user = userEvent.setup();
    render(<TasksPage />);

    await user.type(screen.getByLabelText('Новая задача'), '   ');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Введите название задачи');
    expect(screen.getByLabelText('Новая задача')).toHaveAttribute('aria-invalid', 'true');
    expect(await db.tasks.count()).toBe(0);
  });

  it('shows an error and keeps the title when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(db.tasks, 'add').mockRejectedValueOnce(new Error('quota'));
    render(<TasksPage />);

    await user.type(screen.getByLabelText('Новая задача'), 'Купить молоко');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить задачу');
    expect(screen.getByLabelText('Новая задача')).toHaveValue('Купить молоко');
  });

  it('shows an error when completing a task fails', async () => {
    const user = userEvent.setup();
    await seed('Купить молоко');
    vi.spyOn(db.tasks, 'put').mockRejectedValueOnce(new Error('quota'));
    render(<TasksPage />);

    await user.click(await screen.findByRole('checkbox', { name: 'Выполнено: Купить молоко' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить изменения');
  });

  it('a double tap on «Добавить» creates only one task', async () => {
    const user = userEvent.setup();
    render(<TasksPage />);

    await user.type(screen.getByLabelText('Новая задача'), 'Купить молоко');
    await user.dblClick(screen.getByRole('button', { name: 'Добавить' }));

    expect(await within(section('Входящие')).findByText('Купить молоко')).toBeInTheDocument();
    expect(await db.tasks.count()).toBe(1);
  });
});
