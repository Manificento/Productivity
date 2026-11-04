import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { findSection, renderTasks, seedTask, setupTasksTestEnv, TODAY } from '../testing';

setupTasksTestEnv();

describe('repeating tasks in the list', () => {
  it('Given ежедневная задача на сегодня When я её выполняю Then копия на завтра видна в «Предстоящих»; снятие отметки убирает её', async () => {
    const user = userEvent.setup();
    await seedTask('зарядка', { dueDate: TODAY, recurrence: { kind: 'daily' } });
    renderTasks('/tasks');

    const today = await findSection('Сегодня');
    expect(await within(today).findByText('↻ каждый день')).toBeInTheDocument();
    await user.click(within(today).getByRole('checkbox', { name: 'Выполнено: зарядка' }));
    expect(await db.tasks.count()).toBe(2);

    await user.click(screen.getByRole('link', { name: 'Предстоящие' }));
    expect(await within(await findSection(/^Завтра/)).findByText('зарядка')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Сегодня' }));
    await user.click(
      within(await findSection('Выполнено сегодня')).getByRole('checkbox', { name: 'Выполнено: зарядка' }),
    );
    expect(await within(await findSection('Сегодня')).findByText('зарядка')).toBeInTheDocument();
    expect(await db.tasks.count()).toBe(1);
  });
});
