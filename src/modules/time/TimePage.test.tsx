import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../core/db';
import { TimePage } from './TimePage';

beforeEach(async () => {
  localStorage.clear();
  await Promise.all([db.timeCategories.clear(), db.timeEntries.clear()]);
});

describe('TimePage', () => {
  it('переключает вкладки «Таймер» и «Pomodoro»', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/time']}>
        <Routes>
          <Route path="/time/*" element={<TimePage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: 'Добавить стартовый набор' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Pomodoro' }));
    expect(await screen.findByText(/Фокус-сессии пишутся в учёт времени/)).toBeInTheDocument();
  });
});
