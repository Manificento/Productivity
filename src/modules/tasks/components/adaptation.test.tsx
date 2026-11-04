import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import type { Project } from '../../../core/types';
import { findSection, NOW, renderTasks, seedProject, seedTask, setupTasksTestEnv, TODAY } from '../testing';

setupTasksTestEnv();

/** An exam on 2026-11-07: today (11-04) is a prep day — focus on its project, low priorities may be deferred. */
async function seedExam(project: Project) {
  await db.lifeEvents.add({
    id: 'exam',
    createdAt: NOW,
    updatedAt: NOW,
    title: 'Экзамен по английскому',
    type: 'exam',
    date: '2026-11-07',
    importance: 2,
    projectId: project.id,
    prepDays: 7,
  });
}

const rowTitles = (region: HTMLElement) =>
  within(region)
    .getAllByRole('listitem')
    .map((li) => within(li).getByRole('checkbox').getAttribute('aria-label')?.replace('Выполнено: ', ''));

describe('tasks adapt to the day', () => {
  it('Given цели дня с taskCapacityMin 360 и задачи на сегодня с оценками 420 мин When я открываю «Сегодня» Then вижу Progress «420 из 360 мин» в предупреждающем цвете', async () => {
    await seedTask('Курсовая', { dueDate: TODAY, estimateMin: 240 });
    await seedTask('Отчёт', { dueDate: TODAY, estimateMin: 180 });
    renderTasks('/tasks');

    const text = await screen.findByText('420 из 360 мин');
    expect(text.className).toMatch(/amber/);
    const bar = screen.getByRole('progressbar', { name: 'План на день' });
    expect(bar).toHaveAttribute('aria-valuenow', '420');
    expect(bar).toHaveAttribute('aria-valuemax', '360');
    expect(bar.firstElementChild?.className).toMatch(/amber/);
    expect(screen.getByText('План больше ёмкости дня')).toBeInTheDocument();
  });

  it('Given focusProjectId = проект «Английский» When список отображается Then его задачи идут первыми с чипом «фокус»', async () => {
    const english = await seedProject('Английский');
    await seedExam(english);
    await seedTask('Купить продукты', { dueDate: TODAY, priority: 1 });
    await seedTask('Слова, 50 штук', { dueDate: TODAY, priority: 3, projectId: english.id });
    renderTasks('/tasks');

    const today = await findSection('Сегодня');
    await within(today).findByText('фокус');
    expect(rowTitles(today)).toEqual(['Слова, 50 штук', 'Купить продукты']);
    const [first, second] = within(today).getAllByRole('listitem');
    expect(within(first).getByText('фокус')).toBeInTheDocument();
    expect(within(second).queryByText('фокус')).not.toBeInTheDocument();
  });

  it('Given allowDeferLowPriority = true и план превышает ёмкость When я нажимаю «Перенести P3–P4» Then задачи P3–P4 на сегодня переносятся на день после активного события', async () => {
    const user = userEvent.setup();
    const english = await seedProject('Английский');
    await seedExam(english);
    const big = await seedTask('Пробный экзамен', { dueDate: TODAY, priority: 1, estimateMin: 300 });
    const p3 = await seedTask('Разобрать почту', { dueDate: TODAY, priority: 3, estimateMin: 60 });
    const p4 = await seedTask('Полить цветы', { dueDate: TODAY, priority: 4, estimateMin: 30 });
    renderTasks('/tasks');

    await user.click(await screen.findByRole('button', { name: 'Перенести P3–P4' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Перенесено: 2 задачи на 8 нояб.');
    expect((await db.tasks.get(p3.id))?.dueDate).toBe('2026-11-08');
    expect((await db.tasks.get(p4.id))?.dueDate).toBe('2026-11-08');
    expect((await db.tasks.get(big.id))?.dueDate).toBe(TODAY);
    expect(await screen.findByText('300 из 360 мин')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Перенести P3–P4' })).not.toBeInTheDocument();
  });

  it('Given allowDeferLowPriority = false When список отображается Then кнопки переноса нет', async () => {
    await seedTask('Курсовая', { dueDate: TODAY, priority: 1, estimateMin: 400 });
    await seedTask('Полить цветы', { dueDate: TODAY, priority: 4 });
    renderTasks('/tasks');

    expect(await screen.findByText('430 из 360 мин')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Перенести P3–P4' })).not.toBeInTheDocument();
  });

  it('Given задачи без оценки When считается план Then используется 30 мин по умолчанию и это видно в подсказке', async () => {
    await seedTask('Позвонить', { dueDate: TODAY });
    await seedTask('Написать', { dueDate: TODAY });
    await seedTask('Курсовая', { dueDate: TODAY, estimateMin: 60 });
    renderTasks('/tasks');

    expect(await screen.findByText('120 из 360 мин')).toBeInTheDocument();
    expect(screen.getByText('Без оценки: 2 задачи — считаю по 30 мин')).toBeInTheDocument();
  });
});
