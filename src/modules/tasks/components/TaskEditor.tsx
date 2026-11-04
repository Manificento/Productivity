import { useState, type FormEvent } from 'react';
import { todayKey } from '../../../core/dates';
import type { Id, Task } from '../../../core/types';
import { Button, Field, Input, Segmented, Select, Sheet, Textarea } from '../../../ui';
import { useProjects } from '../data/projects';
import { postponeToTomorrow, updateTask, useTask } from '../data/tasks';
import { formToPatch, taskToForm, validateForm, type FormErrors, type TaskForm } from '../logic/editForm';
import { activeProjects } from '../logic/projects';
import { useToday } from './useToday';

const PRIORITIES: { value: TaskForm['priority']; label: string }[] = [
  { value: '1', label: 'P1' },
  { value: '2', label: 'P2' },
  { value: '3', label: 'P3' },
  { value: '4', label: 'P4' },
];

/** Bottom sheet with every field of a task. Nothing is saved until «Сохранить» (or «На завтра»). */
export function TaskEditor({ taskId, onClose }: { taskId: Id | undefined; onClose: () => void }) {
  // Live: if the task changes elsewhere while the sheet is open, the buttons follow it.
  const task = useTask(taskId);
  return (
    <Sheet open={taskId !== undefined} title="Задача" onClose={onClose}>
      {/* Keyed by id: opening another task starts from that task's values. */}
      {task && <EditorForm key={task.id} task={task} onClose={onClose} />}
    </Sheet>
  );
}

function EditorForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const projects = useProjects() ?? [];
  const today = useToday();
  const [form, setForm] = useState<TaskForm>(() => taskToForm(task));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saveError, setSaveError] = useState<string>();

  const set = (key: keyof TaskForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // Active projects, plus the task's own project if it was archived meanwhile.
  const options = activeProjects(projects);
  const own = projects.find((p) => p.id === task.projectId && p.archived);
  if (own) options.push(own);

  async function save(action: () => Promise<void>) {
    try {
      await action();
      onClose();
    } catch {
      setSaveError('Не удалось сохранить изменения — попробуйте ещё раз');
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void save(() => updateTask(task.id, formToPatch(form)));
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Название" error={errors.title}>
        {(id) => <Input id={id} value={form.title} onChange={(e) => set('title')(e.target.value)} />}
      </Field>
      <Field label="Заметки">
        {(id) => <Textarea id={id} value={form.notes} onChange={(e) => set('notes')(e.target.value)} />}
      </Field>
      <Field label="Проект">
        {(id) => (
          <Select id={id} value={form.projectId} onChange={(e) => set('projectId')(e.target.value)}>
            <option value="">Без проекта</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? ' (в архиве)' : ''}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Приоритет</p>
      <Segmented label="Приоритет" value={form.priority} options={PRIORITIES} onChange={set('priority')} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Дата">
          {(id) => <Input id={id} type="date" value={form.dueDate} onChange={(e) => set('dueDate')(e.target.value)} />}
        </Field>
        <Field label="Время" error={errors.dueTime}>
          {(id) => <Input id={id} type="time" value={form.dueTime} onChange={(e) => set('dueTime')(e.target.value)} />}
        </Field>
      </div>
      <Field label="Оценка, мин" error={errors.estimate}>
        {(id) => (
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            value={form.estimate}
            onChange={(e) => set('estimate')(e.target.value)}
          />
        )}
      </Field>
      <Field label="Теги" hint="Через запятую: учёба, вечер">
        {(id) => <Input id={id} value={form.tags} onChange={(e) => set('tags')(e.target.value)} />}
      </Field>
      {saveError && (
        <p role="alert" className="mb-3 text-sm text-rose-600">
          {saveError}
        </p>
      )}
      {/* Only for tasks due today or overdue: for later or undated tasks «tomorrow» is not a postponement. */}
      {task.completedAt === undefined && task.dueDate !== undefined && task.dueDate <= today && (
        <Button
          variant="secondary"
          className="mb-2 w-full"
          onClick={() => void save(() => postponeToTomorrow(task.id, todayKey()))}
        >
          На завтра
        </Button>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Отмена
        </Button>
        <Button type="submit" className="flex-1">
          Сохранить
        </Button>
      </div>
    </form>
  );
}
