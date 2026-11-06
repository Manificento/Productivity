import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, TABLE_NAMES } from '../../../core/db';
import sample from '../../../../docs/samples/todoist-template.csv?raw';
import { TodoistImportCard } from './TodoistImportCard';

const SAMPLE = new TextEncoder().encode(sample);

function upload(bytes: BlobPart, name = 'Дом.csv') {
  const file = new File([bytes], name, { type: 'text/csv' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => (typeof bytes === 'string' ? new TextEncoder().encode(bytes) : (bytes as Uint8Array)).buffer,
  });
  fireEvent.change(screen.getByLabelText('Файл CSV Todoist'), { target: { files: [file] } });
}

beforeEach(async () => {
  await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
});

describe('Todoist import card', () => {
  it('Given the official template When I upload it and confirm Then the preview says 4 tasks, 1 project, 3 dates unrecognized and tasks are created with source todoist', async () => {
    render(<TodoistImportCard />);
    upload(new Uint8Array(SAMPLE));
    expect(await screen.findByText(/Найдено 4 задачи, 1 проект «Дом»/)).toBeTruthy();
    expect(screen.getByText(/3 срока не распознаны, проверьте после импорта/)).toBeTruthy();
    expect(screen.getByText(/Длительности распознаны: 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Импортировать' }));
    await waitFor(async () => expect(await db.tasks.count()).toBe(4));
    expect((await db.tasks.toArray()).every((t) => t.source === 'todoist')).toBe(true);
    expect(await db.projects.count()).toBe(1);
  });

  it('Given the same file twice When I confirm Then there are no duplicates', async () => {
    render(<TodoistImportCard />);
    for (let i = 0; i < 2; i++) {
      upload(new Uint8Array(SAMPLE));
      fireEvent.click(await screen.findByRole('button', { name: 'Импортировать' }));
      await screen.findByRole('status');
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Импортировать' })).toBeNull());
    }
    expect(await db.tasks.count()).toBe(4);
    expect(await db.projects.count()).toBe(1);
  });

  it('Given a wrong format or non-UTF-8 file When I upload it Then a clear error is shown and data is unchanged', async () => {
    await db.tasks.put({ id: 'mine', createdAt: 0, updatedAt: 0, title: 'Моя', priority: 4, tags: [] });
    render(<TodoistImportCard />);
    upload('a,b\n1,2');
    expect((await screen.findByRole('alert')).textContent).toContain('TYPE,CONTENT');
    upload(new Uint8Array([0xff, 0xfe, 0x41]));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('UTF-8'));
    expect(await db.tasks.count()).toBe(1);
    expect(await db.tasks.get('mine')).toBeDefined();
  });

  it('Given the preview When I press «Отмена» Then nothing is written', async () => {
    render(<TodoistImportCard />);
    upload(new Uint8Array(SAMPLE));
    fireEvent.click(await screen.findByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await db.tasks.count()).toBe(0);
    expect(await db.projects.count()).toBe(0);
  });
});
