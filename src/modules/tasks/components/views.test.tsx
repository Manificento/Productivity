import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { findSection, renderTasks, section, seedProject, seedTask, TODAY, setupTasksTestEnv } from '../testing';

setupTasksTestEnv();

async function seedByDate() {
  await seedTask('Вчерашняя', { dueDate: '2026-11-03' });
  await seedTask('Сегодняшняя', { dueDate: TODAY });
  await seedTask('Завтрашняя', { dueDate: '2026-11-05' });
  await seedTask('Через неделю', { dueDate: '2026-11-11' });
  await seedTask('Без срока');
}

const rowTitles = (region: HTMLElement) =>
  within(region)
    .getAllByRole('listitem')
    .map((li) => within(li).getByRole('checkbox').getAttribute('aria-label')?.replace('Выполнено: ', ''));

describe('task lists', () => {
  it('Given задачи со сроками вчера, сегодня, завтра и без срока When я открываю «Сегодня» Then вижу просроченные (с пометкой) и сегодняшние, но не завтрашние', async () => {
    await seedByDate();
    renderTasks('/tasks');

    const today = await findSection('Сегодня');
    await within(today).findByText('Вчерашняя');
    expect(rowTitles(today)).toEqual(['Вчерашняя', 'Сегодняшняя']);
    expect(within(today).getByText('Просрочено · Вчера')).toBeInTheDocument();
    expect(screen.queryByText('Завтрашняя')).not.toBeInTheDocument();
    expect(screen.queryByText('Без срока')).not.toBeInTheDocument();
  });

  it('Given те же задачи When я открываю «Предстоящие» Then вижу будущие задачи, сгруппированные по дням', async () => {
    await seedByDate();
    renderTasks('/tasks/upcoming');

    expect(rowTitles(await findSection('Завтра · чт, 5 нояб.'))).toEqual(['Завтрашняя']);
    expect(rowTitles(section('ср, 11 нояб.'))).toEqual(['Через неделю']);
    expect(screen.queryByText('Сегодняшняя')).not.toBeInTheDocument();
    expect(screen.queryByText('Без срока')).not.toBeInTheDocument();
  });

  it('Given те же задачи When я открываю «Входящие» Then вижу только задачи без срока', async () => {
    await seedByDate();
    renderTasks('/tasks/inbox');

    const inbox = await findSection('Входящие');
    await within(inbox).findByText('Без срока');
    expect(rowTitles(inbox)).toEqual(['Без срока']);
  });

  it('Given задачи разных приоритетов и времени When список отображается Then порядок: просроченные → приоритет 1…4 → время срока → дата создания', async () => {
    await seedTask('P4 давняя', { dueDate: TODAY, priority: 4, createdAt: 1 });
    await seedTask('P2 без времени', { dueDate: TODAY, priority: 2 });
    await seedTask('P2 в 18:00', { dueDate: TODAY, priority: 2, dueTime: '18:00' });
    await seedTask('Просроченная P4', { dueDate: '2026-11-01', priority: 4 });
    await seedTask('P1', { dueDate: TODAY, priority: 1 });
    await seedTask('P2 в 09:00', { dueDate: TODAY, priority: 2, dueTime: '09:00' });
    renderTasks('/tasks');

    const today = await findSection('Сегодня');
    await within(today).findByText('P1');
    expect(rowTitles(today)).toEqual([
      'Просроченная P4',
      'P1',
      'P2 в 09:00',
      'P2 в 18:00',
      'P2 без времени',
      'P4 давняя',
    ]);
  });

  it('adds a task with the defaults of the open list', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks');
    await user.type(screen.getByLabelText('Новая задача'), 'Позвонить');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await within(section('Сегодня')).findByText('Позвонить')).toBeInTheDocument();
    expect((await db.tasks.toArray())[0].dueDate).toBe(TODAY);
  });

  it('shows empty states', async () => {
    renderTasks('/tasks/upcoming');
    expect(await screen.findByText('Нет задач со сроком в будущем')).toBeInTheDocument();
  });
});

describe('projects', () => {
  it('Given проект «Учёба» с задачами When я открываю вкладку «Проекты» и выбираю его Then вижу только его задачи', async () => {
    const user = userEvent.setup();
    const study = await seedProject('Учёба');
    await seedProject('Работа');
    await seedTask('Конспект', { projectId: study.id });
    await seedTask('Отчёт');
    renderTasks('/tasks');

    await user.click(screen.getByRole('link', { name: 'Проекты' }));
    await user.click(await screen.findByRole('link', { name: /#Учёба/ }));

    expect(await screen.findByRole('heading', { name: '#Учёба' })).toBeInTheDocument();
    const list = await findSection('Задачи проекта');
    await within(list).findByText('Конспект');
    expect(rowTitles(list)).toEqual(['Конспект']);
  });

  it('Given вкладка «Проекты» When я создаю проект Then он появляется в списке; повтор имени — ошибка', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks/projects');
    expect(await screen.findByText('Проектов пока нет — создайте первый')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Новый проект'), 'Учёба');
    await user.click(screen.getByRole('button', { name: 'Создать проект' }));
    expect(await screen.findByRole('link', { name: /#Учёба/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Новый проект'), 'учёба');
    await user.click(screen.getByRole('button', { name: 'Создать проект' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Такой проект уже есть');
    expect(await db.projects.count()).toBe(1);
  });

  it('Given проект «Учёба» When я его переименовываю Then новое имя сохраняется', async () => {
    const user = userEvent.setup();
    const study = await seedProject('Учёба');
    renderTasks(`/tasks/projects/${study.id}`);

    await user.click(await screen.findByRole('button', { name: 'Переименовать проект' }));
    const dialog = screen.getByRole('dialog', { name: 'Переименовать проект' });
    const input = within(dialog).getByLabelText('Название проекта');
    await user.clear(input);
    await user.type(input, 'Университет');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('heading', { name: '#Университет' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await db.projects.get(study.id))?.name).toBe('Университет');
  });

  it('Given проект «Учёба» When я его архивирую Then он уходит из списка проектов в архив, и его можно вернуть', async () => {
    const user = userEvent.setup();
    const study = await seedProject('Учёба');
    renderTasks(`/tasks/projects/${study.id}`);

    await user.click(await screen.findByRole('button', { name: 'В архив' }));

    const archive = await findSection('Архив проектов');
    expect(within(archive).getByText('#Учёба')).toBeInTheDocument();
    expect(within(section('Проекты')).queryByText('#Учёба')).not.toBeInTheDocument();
    expect((await db.projects.get(study.id))?.archived).toBe(true);

    await user.click(within(archive).getByRole('button', { name: 'Вернуть' }));
    expect(await within(section('Проекты')).findByRole('link', { name: /#Учёба/ })).toBeInTheDocument();
  });

  it('adds a task inside a project to that project and shows the project chip in other lists', async () => {
    const user = userEvent.setup();
    const study = await seedProject('Учёба');
    renderTasks(`/tasks/projects/${study.id}`);

    await user.type(await screen.findByLabelText('Новая задача'), 'Конспект');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(await within(section('Задачи проекта')).findByText('Конспект')).toBeInTheDocument();
    expect((await db.tasks.toArray())[0].projectId).toBe(study.id);

    await user.click(screen.getByRole('link', { name: 'Входящие' }));
    expect(await within(await findSection('Входящие')).findByText('#Учёба')).toBeInTheDocument();
  });

  it('shows «Проект не найден» for an unknown project', async () => {
    renderTasks('/tasks/projects/nope');
    expect(await screen.findByText(/Проект не найден/)).toBeInTheDocument();
  });
});
