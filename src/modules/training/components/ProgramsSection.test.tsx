import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { ProgramsSection } from './ProgramsSection';

const TODAY = '2026-11-04'; // Wednesday

beforeEach(async () => {
  await db.programs.clear();
  await db.plannedSessions.clear();
  await db.workoutLogs.clear();
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

describe('session execution', () => {
  const start = async (today = TODAY) => {
    renderIt(today);
    fireEvent.click(await screen.findByRole('button', { name: 'Шаблон: Сила 3 раза в неделю' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
    await screen.findByRole('list', { name: 'Сессия на сегодня' });
  };

  it('Given сегодняшняя сессия When я отмечаю подходы и нажимаю «Завершить» Then запись в workoutLogs с упражнениями и RPE; сессия выполнена', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Подход 1: Румынская тяга' }));
    fireEvent.click(screen.getByRole('button', { name: 'Подход 2: Румынская тяга' }));
    fireEvent.change(screen.getByLabelText('Длительность, мин'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('RPE (1–10)'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));

    expect(await screen.findByText('Тренировка выполнена ✓')).toBeInTheDocument();
    const [log] = await db.workoutLogs.toArray();
    expect(log).toMatchObject({
      date: TODAY,
      rpe: 7,
      durationMin: 45,
      exercises: [{ name: 'Румынская тяга', sets: [{ reps: 8 }, { reps: 8 }] }],
    });
    expect((await db.plannedSessions.where('date').equals(TODAY).toArray())[0]).toMatchObject({
      status: 'done',
      workoutLogId: log.id,
    });
  });

  it('finishing without sets, duration or RPE shows an error and saves nothing', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Отметьте хотя бы один подход');
    expect(await db.workoutLogs.count()).toBe(0);
  });

  it('Given сессия When я заменяю упражнение Then изменение только в этой сессии', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Заменить упражнение: Румынская тяга' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Новое упражнение'), { target: { value: 'Становая тяга' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Заменить' }));
    expect(await screen.findByText(/Становая тяга: 3 × 8/)).toBeInTheDocument();
    const [program] = await db.programs.toArray();
    expect(program.days.flatMap((d) => d.exercises.map((e) => e.name))).not.toContain('Становая тяга');
    const sessions = await db.plannedSessions.toArray();
    expect(sessions.filter((s) => s.exercises.some((e) => e.name === 'Становая тяга'))).toHaveLength(1);
  });

  it('Given сессия не выполнена When наступает следующий день Then она «пропущена», план не сдвигается', async () => {
    await start();
    const before = (await db.plannedSessions.toArray()).map((s) => s.date).sort();
    cleanup();
    renderIt('2026-11-05');
    await waitFor(async () =>
      expect((await db.plannedSessions.where('date').equals(TODAY).first())?.status).toBe('skipped'),
    );
    expect((await db.plannedSessions.toArray()).map((s) => s.date).sort()).toEqual(before);
  });
});
