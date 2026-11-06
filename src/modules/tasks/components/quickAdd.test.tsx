import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { findSection, renderTasks, seedProject, setupTasksTestEnv } from '../testing';

// A gate the test can hold shut to keep `addQuickTask` "still saving".
const gate = vi.hoisted(() => ({ release: undefined as undefined | (() => void), hold: false }));
vi.mock('../data/tasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/tasks')>();
  return {
    ...actual,
    addQuickTask: async (...args: Parameters<typeof actual.addQuickTask>) => {
      const result = await actual.addQuickTask(...args);
      if (gate.hold) await new Promise<void>((resolve) => (gate.release = resolve));
      return result;
    },
  };
});

setupTasksTestEnv();

const chips = () =>
  within(screen.getByRole('list', { name: 'Распознано' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('quick add field', () => {
  it('Given я нажал «Добавить», сохранение ещё идёт When я начинаю вводить следующую задачу Then после сохранения мой новый текст остаётся в поле (очищается только отправленная строка)', async () => {
    const user = userEvent.setup();
    gate.hold = true;
    try {
      renderTasks('/tasks/inbox');
      const field = screen.getByLabelText('Новая задача');

      await user.type(field, 'первая');
      await user.click(screen.getByRole('button', { name: 'Добавить' }));
      await waitFor(() => expect(gate.release).toBeDefined());
      await user.type(field, 'вторая');
      gate.release!();

      await waitFor(() => expect(screen.getByRole('button', { name: 'Добавить' })).toBeEnabled());
      expect(field).toHaveValue('вторая');
    } finally {
      gate.hold = false;
      gate.release = undefined;
    }
  });

  it('Given я печатаю «завтра 9:00 позвонить #учёба !1» When текст меняется Then под полем появляются чипы: «Завтра 09:00», «#учёба», «P1»', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks/inbox');
    expect(screen.queryByRole('list', { name: 'Распознано' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Новая задача'), 'завтра 9:00 позвонить #учёба !1');

    expect(chips()).toEqual(['Завтра 09:00', '#учёба', 'P1']);
  });

  it('Given проекта «учёба» нет When я сохраняю задачу Then проект создаётся (сравнение без учёта регистра), задача привязана к нему', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks/inbox');

    await user.type(screen.getByLabelText('Новая задача'), 'конспект #учёба');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    const inbox = await findSection('Входящие');
    expect(await within(inbox).findByText('конспект')).toBeInTheDocument();
    expect(within(inbox).getByText('#учёба')).toBeInTheDocument();
    const [project] = await db.projects.toArray();
    expect(project.name).toBe('учёба');
    expect((await db.tasks.toArray())[0].projectId).toBe(project.id);
  });

  it('Given проект «Учёба» уже есть When я пишу «#учёба» Then новый проект не создаётся', async () => {
    const user = userEvent.setup();
    const study = await seedProject('Учёба');
    renderTasks('/tasks/inbox');

    await user.type(screen.getByLabelText('Новая задача'), 'конспект #учёба');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await within(await findSection('Входящие')).findByText('#Учёба')).toBeInTheDocument();
    expect(await db.projects.count()).toBe(1);
    expect((await db.tasks.toArray())[0].projectId).toBe(study.id);
  });

  it('Given задача сохранена When поле очищается Then фокус остаётся в поле для следующей задачи', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks/inbox');
    const field = screen.getByLabelText('Новая задача');

    await user.type(field, 'первая');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(await within(await findSection('Входящие')).findByText('первая')).toBeInTheDocument();
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();

    await user.type(field, 'вторая{Enter}');
    expect(await screen.findByText('вторая')).toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it('saves the parsed fields and strips them from the title', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks/inbox');

    await user.type(screen.getByLabelText('Новая задача'), 'завтра 9:00 позвонить научнику !1 @звонки ~15м');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => expect(screen.getByLabelText('Новая задача')).toHaveValue(''));
    const [task] = await db.tasks.toArray();
    expect(task).toMatchObject({
      title: 'позвонить научнику',
      dueDate: '2026-11-05',
      dueTime: '09:00',
      priority: 1,
      tags: ['звонки'],
      estimateMin: 15,
    });
  });

  it('a line with only a date has no title and shows the error', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks/inbox');
    await user.type(screen.getByLabelText('Новая задача'), 'завтра');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Введите название задачи');
    expect(await db.tasks.count()).toBe(0);
  });

  it('a typed date wins over the list default; without one the list default applies', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks');
    await user.type(screen.getByLabelText('Новая задача'), 'отчёт в пт{Enter}');
    await user.type(screen.getByLabelText('Новая задача'), 'звонок{Enter}');

    expect(await within(await findSection('Сегодня')).findByText('звонок')).toBeInTheDocument();
    const byTitle = Object.fromEntries((await db.tasks.toArray()).map((t) => [t.title, t.dueDate]));
    expect(byTitle).toEqual({ отчёт: '2026-11-06', звонок: '2026-11-04' });
  });

  it('the preview shows the list day and the existing project under its own name', async () => {
    const user = userEvent.setup();
    await seedProject('Учёба');
    renderTasks('/tasks/upcoming');

    await user.type(screen.getByLabelText('Новая задача'), '9:00 конспект #учёба');
    expect(chips()).toEqual(['Завтра 09:00', '#Учёба']);
    await user.keyboard('{Enter}');

    expect(await within(await findSection(/^Завтра/)).findByText('конспект')).toBeInTheDocument();
    expect((await db.tasks.toArray())[0]).toMatchObject({ dueDate: '2026-11-05', dueTime: '09:00' });
  });
});
