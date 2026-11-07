import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { shiftDateKey } from '../../../core/dates';
import { logWeight } from '../data/weight';
import { WeightCard } from './WeightCard';

const TODAY = '2026-11-04';

beforeEach(async () => {
  await db.weightLogs.clear();
});

const enter = (value: string) => {
  fireEvent.change(screen.getByLabelText('Вес, кг'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Записать' }));
};

describe('weight card', () => {
  it('Given пустой журнал When я открываю «Питание» Then пустое состояние с полем веса и кнопкой «Записать»', async () => {
    render(<WeightCard today={TODAY} />);
    expect(await screen.findByLabelText('Вес, кг')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Записать' })).toBeInTheDocument();
    expect(screen.getByText(/Записей веса пока нет/)).toBeInTheDocument();
  });

  it('Given я ввожу 72,4 When нажимаю «Записать» Then запись за сегодня с DateKey; повторный ввод за день заменяет её', async () => {
    render(<WeightCard today={TODAY} />);
    await screen.findByLabelText('Вес, кг');
    enter('72,4');
    expect(await screen.findByText('Записано: 72,4 кг')).toBeInTheDocument();
    expect(await db.weightLogs.toArray()).toMatchObject([{ date: TODAY, kg: 72.4 }]);

    enter('72,0');
    await waitFor(async () => expect(await db.weightLogs.toArray()).toMatchObject([{ date: TODAY, kg: 72 }]));
    expect(await db.weightLogs.count()).toBe(1);
  });

  it('Given ≥ 14 записей When я смотрю график Then линия тренда поверх точек и подпись «изменение за неделю»', async () => {
    for (let i = 0; i < 14; i++) await logWeight(shiftDateKey(TODAY, i - 13), 80 - i * 0.1);
    render(<WeightCard today={TODAY} />);
    expect(await screen.findAllByTestId('weight-point')).toHaveLength(14);
    expect(screen.getByTestId('weight-trend')).toBeInTheDocument();
    expect(screen.getByText(/Изменение за неделю/)).toHaveTextContent(/−0,[1-9] кг/);
  });

  it('Given меньше 14 записей When я смотрю график Then только точки, без линии тренда', async () => {
    await logWeight(TODAY, 70);
    render(<WeightCard today={TODAY} />);
    expect(await screen.findAllByTestId('weight-point')).toHaveLength(1);
    expect(screen.queryByTestId('weight-trend')).not.toBeInTheDocument();
  });

  it('Given ввод 0 или 400 When я нажимаю «Записать» Then ошибка валидации, запись не создаётся', async () => {
    render(<WeightCard today={TODAY} />);
    await screen.findByLabelText('Вес, кг');
    for (const bad of ['0', '400']) {
      enter(bad);
      expect(await screen.findByRole('alert')).toHaveTextContent('кг');
    }
    expect(await db.weightLogs.count()).toBe(0);
  });

  it('Given записи с пропусками When я смотрю график Then ось X — календарные дни, линия тренда разорвана на пропуске', async () => {
    const offsets = [...Array.from({ length: 14 }, (_, i) => -30 + i), -5, -4]; // −30…−17, gap, −5, −4
    for (const offset of offsets) await logWeight(shiftDateKey(TODAY, offset), 80);
    render(<WeightCard today={TODAY} />);
    const points = await screen.findAllByTestId('weight-point');
    expect(screen.getAllByTestId('weight-trend')).toHaveLength(2);
    const xs = points.map((p) => Number(p.getAttribute('cx')));
    const step = xs[1]! - xs[0]!;
    expect(xs[14]! - xs[13]!).toBeCloseTo(step * 12, 5); // −17 → −5
    expect(xs[15]! - xs[14]!).toBeCloseTo(step, 5);
  });

  it('Given больше 90 дней записей When я смотрю график Then последние 90 дней и переключатель «Вся история»', async () => {
    for (const offset of [-120, -100, -91, -89, -30, 0]) await logWeight(shiftDateKey(TODAY, offset), 80);
    render(<WeightCard today={TODAY} />);
    expect(await screen.findAllByTestId('weight-point')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Вся история' }));
    expect(await screen.findAllByTestId('weight-point')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Вся история', pressed: true }));
    expect(await screen.findAllByTestId('weight-point')).toHaveLength(3);
  });

  it('Given записи только за последние 90 дней When я смотрю график Then переключателя нет', async () => {
    await logWeight(shiftDateKey(TODAY, -89), 80);
    render(<WeightCard today={TODAY} />);
    await screen.findAllByTestId('weight-point');
    expect(screen.queryByRole('button', { name: 'Вся история' })).not.toBeInTheDocument();
  });
});
