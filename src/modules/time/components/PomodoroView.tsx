import { useState } from 'react';
import { Button, Card, Empty, Field, Select, Sheet } from '../../../ui';
import { createDefaultCategories, useCategories, useOpenTasks } from '../data/timeStore';
import { phaseMinutes, remainingMs, sessionInCycle, type Phase } from '../logic/pomodoro';
import { formatDuration } from '../logic/timer';
import { PomodoroSettingsForm } from './PomodoroSettingsForm';
import { notificationsState } from './signal';
import { usePomodoro } from './usePomodoro';

const PHASE_LABEL: Record<Phase, string> = {
  work: 'Фокус',
  shortBreak: 'Перерыв',
  longBreak: 'Длинный перерыв',
};

export function PomodoroView() {
  const pomodoro = usePomodoro();
  const { state, settings, now } = pomodoro;
  const categories = useCategories();
  const tasks = useOpenTasks();
  const [taskId, setTaskId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [permission, setPermission] = useState(notificationsState);

  if (categories === undefined || tasks === undefined) return <Empty>Загрузка…</Empty>;

  if (categories.length === 0) {
    return (
      <Card title="Pomodoro">
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Фокус-сессии пишутся в учёт времени по категории. Сначала добавьте категории.
        </p>
        <Button className="w-full" onClick={() => void createDefaultCategories()}>
          Добавить стартовый набор
        </Button>
      </Card>
    );
  }

  const chosenCategory = categories.some((c) => c.id === categoryId) ? categoryId : categories[0]!.id;
  const chosenTask = tasks.some((t) => t.id === taskId) ? taskId : '';
  const running = state.status === 'running';
  const phase: Phase = running ? state.phase : 'work';
  const left = running ? remainingMs(state, now) : phaseMinutes('work', settings) * 60_000;
  const runningTask = running && state.target.taskId ? tasks.find((t) => t.id === state.target.taskId) : undefined;

  async function askNotifications() {
    setPermission(await Notification.requestPermission());
  }

  return (
    <>
      <Card>
        <div role="timer" aria-label="Pomodoro" className="text-center">
          <p className="text-sm font-medium text-zinc-500">
            {running ? PHASE_LABEL[phase] : 'Готово к фокусу'} · сессия {sessionInCycle(state, settings)} из{' '}
            {settings.sessionsBeforeLongBreak}
          </p>
          <p className="my-2 text-5xl font-semibold tabular-nums">{formatDuration(left)}</p>
          {runningTask && <p className="truncate text-sm text-zinc-500">{runningTask.title}</p>}
        </div>
        <div className="mt-3">
          {!running && (
            <Button
              className="w-full"
              onClick={() =>
                void pomodoro.start(
                  chosenTask ? { categoryId: chosenCategory, taskId: chosenTask } : { categoryId: chosenCategory },
                )
              }
            >
              Начать фокус
            </Button>
          )}
          {running && phase === 'work' && (
            <Button variant="danger" className="w-full" onClick={pomodoro.stop}>
              Остановить
            </Button>
          )}
          {running && phase !== 'work' && (
            <Button variant="secondary" className="w-full" onClick={pomodoro.stop}>
              Пропустить перерыв
            </Button>
          )}
        </div>
        {pomodoro.error && (
          <p role="alert" className="mt-2 text-sm text-rose-600">
            {pomodoro.error}
          </p>
        )}
      </Card>

      {!running && (
        <Card title="Сессия">
          <Field label="Задача">
            {(id) => (
              <Select id={id} value={chosenTask} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">Без задачи</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Категория">
            {(id) => (
              <Select id={id} value={chosenCategory} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="secondary" className="w-full" onClick={() => setSettingsOpen(true)}>
          Длительности: {settings.workMin} / {settings.shortBreakMin} / {settings.longBreakMin} мин
        </Button>
        {permission === 'default' && (
          <Button variant="secondary" className="w-full" onClick={() => void askNotifications()}>
            Разрешить уведомления о конце сессии
          </Button>
        )}
        {permission === 'denied' && (
          <p className="text-center text-sm text-zinc-500">
            Уведомления запрещены в браузере — сигнал прозвучит, только пока открыта вкладка.
          </p>
        )}
      </div>

      <Sheet open={settingsOpen} title="Настройки Pomodoro" onClose={() => setSettingsOpen(false)}>
        <PomodoroSettingsForm
          settings={settings}
          onSave={(next) => {
            pomodoro.saveSettings(next);
            setSettingsOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}
