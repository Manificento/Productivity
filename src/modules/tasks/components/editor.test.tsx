import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { findSection, NOW, renderTasks, seedProject, seedTask, setupTasksTestEnv, TODAY } from '../testing';

setupTasksTestEnv();

async function openEditor(title: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: new RegExp(`^${title}`) }));
  const dialog = screen.getByRole('dialog', { name: 'Задача' });
  // The editor reads the task live from the DB, so its fields appear a tick later.
  await within(dialog).findByLabelText('Название');
  return { user, dialog };
}

describe('task editor', () => {
  it('Given есть задача When я тапаю по ней Then открывается Sheet со всеми полями (название, заметки, проект, приоритет, срок, время, оценка, теги)', async () => {
    const study = await seedProject('Учёба');
    await seedTask('Конспект', {
      notes: 'глава 3',
      projectId: study.id,
      priority: 2,
      dueDate: TODAY,
      dueTime: '18:00',
      estimateMin: 45,
      tags: ['учёба'],
    });
    renderTasks('/tasks');

    const { dialog } = await openEditor('Конспект');
    const d = within(dialog);
    expect(d.getByLabelText('Название')).toHaveValue('Конспект');
    expect(d.getByLabelText('Заметки')).toHaveValue('глава 3');
    expect(await d.findByRole('option', { name: 'Учёба' })).toBeInTheDocument();
    expect(d.getByLabelText('Проект')).toHaveValue(study.id);
    expect(d.getByRole('radio', { name: 'P2' })).toHaveAttribute('aria-checked', 'true');
    expect(d.getByLabelText('Дата')).toHaveValue(TODAY);
    expect(d.getByLabelText('Время')).toHaveValue('18:00');
    expect(d.getByLabelText('Оценка, мин')).toHaveValue(45);
    expect(d.getByLabelText('Теги')).toHaveValue('учёба');
  });

  it('Given открыт редактор When я меняю поля и сохраняю Then изменения в БД, updatedAt обновлён', async () => {
    const study = await seedProject('Учёба');
    const task = await seedTask('Конспект', { dueDate: TODAY });
    vi.setSystemTime(NOW + 60_000);
    renderTasks('/tasks');

    const { user, dialog } = await openEditor('Конспект');
    const d = within(dialog);
    await user.clear(d.getByLabelText('Название'));
    await user.type(d.getByLabelText('Название'), 'Конспект главы 3');
    await user.type(d.getByLabelText('Заметки'), 'с примерами');
    await d.findByRole('option', { name: 'Учёба' });
    await user.selectOptions(d.getByLabelText('Проект'), study.id);
    await user.click(d.getByRole('radio', { name: 'P1' }));
    await user.clear(d.getByLabelText('Дата'));
    await user.type(d.getByLabelText('Дата'), '2026-11-06');
    await user.type(d.getByLabelText('Время'), '09:30');
    await user.type(d.getByLabelText('Оценка, мин'), '40');
    await user.type(d.getByLabelText('Теги'), 'учёба, вечер');
    await user.click(d.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await db.tasks.get(task.id)).toMatchObject({
      title: 'Конспект главы 3',
      notes: 'с примерами',
      projectId: study.id,
      priority: 1,
      dueDate: '2026-11-06',
      dueTime: '09:30',
      estimateMin: 40,
      tags: ['учёба', 'вечер'],
      createdAt: NOW,
      updatedAt: NOW + 60_000,
    });
  });

  it('Given задача на сегодня When я нажимаю «На завтра» Then срок становится завтрашним', async () => {
    const task = await seedTask('Конспект', { dueDate: TODAY });
    renderTasks('/tasks');

    const { user, dialog } = await openEditor('Конспект');
    await user.click(within(dialog).getByRole('button', { name: 'На завтра' }));

    expect(await screen.findByText('На сегодня задач нет')).toBeInTheDocument();
    expect((await db.tasks.get(task.id))?.dueDate).toBe('2026-11-05');
  });

  it('Given открыт редактор When я нажимаю «Отмена» Then ничего не меняется', async () => {
    const task = await seedTask('Конспект', { dueDate: TODAY });
    renderTasks('/tasks');

    const { user, dialog } = await openEditor('Конспект');
    await user.type(within(dialog).getByLabelText('Название'), ' изменено');
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await db.tasks.get(task.id)).toEqual(task);
  });

  it('Given открыт редактор When я нажимаю Escape Then ничего не меняется', async () => {
    const task = await seedTask('Конспект', { dueDate: TODAY });
    renderTasks('/tasks');

    const { user, dialog } = await openEditor('Конспект');
    await user.type(within(dialog).getByLabelText('Название'), ' изменено');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await db.tasks.get(task.id)).toEqual(task);

    // Reopening starts from the stored values, not the abandoned edit.
    const again = await openEditor('Конспект');
    expect(within(again.dialog).getByLabelText('Название')).toHaveValue('Конспект');
  });

  it('shows field errors and does not save an invalid form', async () => {
    const task = await seedTask('Конспект');
    renderTasks('/tasks/inbox');

    const { user, dialog } = await openEditor('Конспект');
    const d = within(dialog);
    await user.clear(d.getByLabelText('Название'));
    await user.type(d.getByLabelText('Время'), '09:00');
    await user.click(d.getByRole('button', { name: 'Сохранить' }));

    expect(d.getByText('Введите название задачи')).toBeInTheDocument();
    expect(d.getByText('Сначала укажите дату')).toBeInTheDocument();
    expect(await db.tasks.get(task.id)).toEqual(task);
  });

  it('shows an error when saving fails and keeps the editor open', async () => {
    await seedTask('Конспект');
    vi.spyOn(db.tasks, 'put').mockRejectedValueOnce(new Error('quota'));
    renderTasks('/tasks/inbox');

    const { user, dialog } = await openEditor('Конспект');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Не удалось сохранить изменения');
    expect(screen.getByRole('dialog', { name: 'Задача' })).toBeInTheDocument();
  });

  it('«На завтра» is offered for overdue tasks but not for later or undated ones', async () => {
    await seedTask('Просроченная', { dueDate: '2026-11-01' });
    await seedTask('Позже', { dueDate: '2026-11-10' });
    await seedTask('Без срока');
    renderTasks('/tasks');
    let editor = await openEditor('Просроченная');
    expect(within(editor.dialog).getByRole('button', { name: 'На завтра' })).toBeInTheDocument();
    await editor.user.keyboard('{Escape}');

    await editor.user.click(screen.getByRole('link', { name: 'Предстоящие' }));
    editor = await openEditor('Позже');
    expect(within(editor.dialog).queryByRole('button', { name: 'На завтра' })).not.toBeInTheDocument();
    await editor.user.keyboard('{Escape}');

    await editor.user.click(screen.getByRole('link', { name: 'Входящие' }));
    editor = await openEditor('Без срока');
    expect(within(editor.dialog).queryByRole('button', { name: 'На завтра' })).not.toBeInTheDocument();
  });

  it('a completed task can be edited but not postponed', async () => {
    await seedTask('Конспект', { dueDate: TODAY, completedAt: NOW });
    renderTasks('/tasks');
    await findSection('Выполнено сегодня');
    const { dialog } = await openEditor('Конспект');
    expect(within(dialog).queryByRole('button', { name: 'На завтра' })).not.toBeInTheDocument();
  });
});
