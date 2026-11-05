import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { ProgramsSection } from './ProgramsSection';

const TODAY = '2026-11-04'; // Wednesday

beforeEach(async () => {
  await db.programs.clear();
  await db.plannedSessions.clear();
});

const renderIt = (today = TODAY) => render(<ProgramsSection today={today} />);
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('programs section', () => {
  it('Given пустой блок When я открываю «Тренировки» Then пустое состояние и «Создать программу» со стартовыми шаблонами: сила 3 раза в неделю, бег, растяжка', async () => {
    renderIt();
    expect(await screen.findByText(/Программ пока нет/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать программу' })).toBeInTheDocument();
    for (const name of ['Сила 3 раза в неделю', 'Бег', 'Растяжка']) {
      expect(screen.getByRole('button', { name: `Шаблон: ${name}` })).toBeInTheDocument();
    }
  });

  it('Given я создаю программу When добавляю дни недели и упражнения с подходами Then программа в programs, план на 4 недели — в plannedSessions', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Создать программу' }));
    fill('Название программы', 'Моя сила');
    fireEvent.click(screen.getByRole('button', { name: 'Ср' }));
    fill('Упражнение 1, Ср', 'Жим');
    fill('Подходы 1, Ср', '4');
    fill('Повторы 1, Ср', '6');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));

    await waitFor(async () => expect(await db.programs.count()).toBe(1));
    const [p] = await db.programs.toArray();
    expect(p).toMatchObject({
      name: 'Моя сила',
      days: [{ weekday: 3, exercises: [{ name: 'Жим', sets: 4, reps: 6 }] }],
    });
    expect(await db.plannedSessions.count()).toBe(4);
  });

  it('an invalid form shows an error and saves nothing', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Создать программу' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Введите название программы');
    expect(await db.programs.count()).toBe(0);
  });

  it('Given активная программа When я открываю «Сегодня» Then сегодняшняя сессия или «день отдыха»', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Шаблон: Сила 3 раза в неделю' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
    // Wednesday is a training day of the template.
    const list = await screen.findByRole('list', { name: 'Сессия на сегодня' });
    expect(within(list).getByText(/Румынская тяга: 3 × 8/)).toBeInTheDocument();
  });

  it('shows «День отдыха» on a day without a session', async () => {
    renderIt('2026-11-05'); // Thursday
    fireEvent.click(await screen.findByRole('button', { name: 'Шаблон: Сила 3 раза в неделю' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
    expect(await screen.findByText('День отдыха')).toBeInTheDocument();
  });

  it('Given программа When я архивирую её Then будущие plannedSessions удалены', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Шаблон: Бег' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Архивировать Бег' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Архивировать' }));
    expect(await screen.findByText(/Программ пока нет/)).toBeInTheDocument();
    const left = await db.plannedSessions.toArray();
    expect(left.every((s) => s.date <= TODAY)).toBe(true);
    expect((await db.programs.toArray())[0].archived).toBe(true);
  });

  it('a failed save shows an error and keeps the form open', async () => {
    vi.spyOn(db.programs, 'add').mockRejectedValueOnce(new Error('boom'));
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Шаблон: Бег' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить программу');
    expect(screen.getByRole('button', { name: 'Сохранить программу' })).toBeEnabled();
  });

  it('a failed archive shows an error and keeps the sheet open', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Шаблон: Бег' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Архивировать Бег' }));
    vi.spyOn(db.programs, 'update').mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Архивировать' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось архивировать');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
