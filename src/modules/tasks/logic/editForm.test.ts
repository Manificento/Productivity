import { describe, expect, it } from 'vitest';
import type { Task } from '../../../core/types';
import { formToPatch, parseTags, taskToForm, validateForm, type TaskForm } from './editForm';

const task: Task = {
  id: 't',
  createdAt: 1,
  updatedAt: 1,
  title: 'Конспект',
  notes: 'глава 3',
  projectId: 'study',
  priority: 2,
  dueDate: '2026-11-04',
  dueTime: '18:00',
  estimateMin: 45,
  tags: ['учёба', 'вечер'],
};

const form = (over: Partial<TaskForm> = {}): TaskForm => ({ ...taskToForm(task), ...over });

describe('edit form', () => {
  it('fills the form from a task and turns it back into the same fields', () => {
    expect(taskToForm(task)).toEqual({
      title: 'Конспект',
      notes: 'глава 3',
      projectId: 'study',
      priority: '2',
      dueDate: '2026-11-04',
      dueTime: '18:00',
      estimate: '45',
      tags: 'учёба, вечер',
    });
    expect(formToPatch(form())).toEqual({
      title: 'Конспект',
      notes: 'глава 3',
      projectId: 'study',
      priority: 2,
      dueDate: '2026-11-04',
      dueTime: '18:00',
      estimateMin: 45,
      tags: ['учёба', 'вечер'],
    });
  });

  it('empty optional fields become absent (undefined), the title is trimmed', () => {
    expect(
      formToPatch(
        form({ title: '  Конспект ', notes: ' ', projectId: '', dueDate: '', dueTime: '', estimate: '', tags: '' }),
      ),
    ).toEqual({
      title: 'Конспект',
      notes: undefined,
      projectId: undefined,
      priority: 2,
      dueDate: undefined,
      dueTime: undefined,
      estimateMin: undefined,
      tags: [],
    });
  });

  it('validates title, estimate and a time without a date', () => {
    expect(validateForm(form())).toEqual({});
    expect(validateForm(form({ title: ' ', estimate: '0', dueDate: '', dueTime: '09:00' }))).toEqual({
      title: 'Введите название задачи',
      estimate: 'Оценка — целое число минут больше 0',
      dueTime: 'Сначала укажите дату',
    });
    expect(validateForm(form({ estimate: '1.5' })).estimate).toBeDefined();
    expect(validateForm(form({ estimate: '1441' })).estimate).toBeDefined();
  });

  it('parses tags separated by commas or spaces, without @ and duplicates', () => {
    expect(parseTags(' @учёба, вечер  учёба,, ')).toEqual(['учёба', 'вечер']);
  });

  it('a task without optional fields gives empty strings', () => {
    expect(taskToForm({ id: 'x', createdAt: 0, updatedAt: 0, title: 'x', priority: 4, tags: [] })).toEqual({
      title: 'x',
      notes: '',
      projectId: '',
      priority: '4',
      dueDate: '',
      dueTime: '',
      estimate: '',
      tags: '',
    });
  });
});
