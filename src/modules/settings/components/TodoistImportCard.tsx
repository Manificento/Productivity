import { useRef, useState } from 'react';
import { Button, Card, Sheet } from '../../../ui';
import { countCompletedInApp, importTodoist } from '../data/todoistImport';
import { NOT_UTF8_ERROR, decodeUtf8, parseTodoistCsv, type TodoistPreview } from '../logic/todoistCsv';

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «Импорт задач из Todoist (CSV)»: файл → предпросмотр → подтверждение. До подтверждения ничего не пишется. */
export function TodoistImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<TodoistPreview>();
  /** Задач файла, уже выполненных в LifeOS: повторный импорт оставит их выполненными. */
  const [doneInApp, setDoneInApp] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();

  async function onFile(file: File) {
    setStatus(undefined);
    setError(undefined);
    try {
      const text = decodeUtf8(await file.arrayBuffer());
      if (text === null) return setError(NOT_UTF8_ERROR);
      const r = parseTodoistCsv(text, file.name);
      if (!r.ok) return setError(r.error);
      setDoneInApp(await countCompletedInApp(r.preview));
      setPreview(r.preview);
    } catch {
      setError('Не удалось прочитать файл. Данные не изменены.');
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await importTodoist(preview);
      setPreview(undefined);
      setStatus(`Импортировано: новых задач ${r.tasks.created}, обновлено ${r.tasks.updated}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось импортировать. Данные не изменены.');
    }
    setBusy(false);
  }

  const n = preview?.tasks.length ?? 0;
  return (
    <Card title="Импорт из Todoist">
      <p className="mb-3 text-sm text-zinc-500">
        Загрузите CSV-экспорт проекта Todoist (UTF-8). Задачи добавятся в проект с именем файла; повторная загрузка
        обновит их, а не продублирует.
      </p>
      <Button variant="secondary" onClick={() => fileRef.current?.click()}>
        Импорт задач из Todoist (CSV)
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        aria-label="Файл CSV Todoist"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void onFile(f);
        }}
      />
      {error && !preview && (
        <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="mt-3 text-sm">
          {status}
        </p>
      )}
      <Sheet open={preview !== undefined} title="Импорт из Todoist" onClose={() => setPreview(undefined)}>
        {preview && (
          <>
            <p className="mb-2 text-sm">
              Найдено {n} {plural(n, 'задача', 'задачи', 'задач')}, 1 проект «{preview.project.name}»
            </p>
            {preview.durations > 0 && (
              <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
                Длительности распознаны: {preview.durations}
              </p>
            )}
            {doneInApp > 0 && (
              <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
                {doneInApp} {plural(doneInApp, 'уже выполнена', 'уже выполнены', 'уже выполнены')} в LifeOS,{' '}
                {plural(doneInApp, 'останется выполненной', 'останутся выполненными', 'останутся выполненными')}
              </p>
            )}
            {preview.unrecognizedDates > 0 && (
              <p role="note" className="mb-2 text-sm text-amber-800 dark:text-amber-300">
                {preview.unrecognizedDates} {plural(preview.unrecognizedDates, 'срок', 'срока', 'сроков')}{' '}
                {plural(preview.unrecognizedDates, 'не распознан', 'не распознаны', 'не распознаны')}, проверьте после
                импорта
              </p>
            )}
            {error && (
              <p role="alert" className="mb-2 text-sm text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setPreview(undefined);
                  setError(undefined);
                }}
              >
                Отмена
              </Button>
              <Button disabled={busy || n === 0} onClick={() => void confirm()}>
                Импортировать
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </Card>
  );
}
