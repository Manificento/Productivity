/** Test helpers for the tasks module. Imported only by *.test.tsx files. */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import { db } from '../../core/db';
import { newRecord } from '../../core/ids';
import type { Project, Task } from '../../core/types';
import { TasksPage } from './TasksPage';

/** 2026-11-04 12:00 local time — "now" in every tasks UI test. */
export const NOW = new Date(2026, 10, 4, 12, 0).getTime();
export const TODAY = '2026-11-04';

/** Fixes the clock (only Date, so userEvent and Dexie timers keep working) and empties the module's tables. */
export function setupTasksTestEnv(): void {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await Promise.all([db.tasks.clear(), db.projects.clear()]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
}

export function renderTasks(path = '/tasks') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tasks/*" element={<TasksPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

export async function seedTask(title: string, over: Partial<Task> = {}): Promise<Task> {
  const task: Task = { ...newRecord({ title, priority: 4 as const, tags: [] }, NOW), ...over };
  await db.tasks.add(task);
  return task;
}

export async function seedProject(name: string, over: Partial<Project> = {}): Promise<Project> {
  const project: Project = { ...newRecord({ name, archived: false }, NOW), ...over };
  await db.projects.add(project);
  return project;
}

export const section = (name: string | RegExp) => screen.getByRole('region', { name });
export const findSection = (name: string | RegExp) => screen.findByRole('region', { name });
