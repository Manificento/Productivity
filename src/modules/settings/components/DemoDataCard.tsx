import { useState } from 'react';
import { todayKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { Button, Card, Sheet } from '../../../ui';
import { hasUserData, loadDemoData } from '../data/demo';
import { DEMO_DAYS, DEMO_EVENT_IN_DAYS } from '../logic/demo';

type Step = { kind: 'idle' } | { kind: 'confirm'; replaces: boolean };

/** «Заполнить демо-данными»: asks first; if there is user data, warns and offers an export. */
export function DemoDataCard({ onExport, today }: { onExport: () => Promise<void>; today?: DateKey }) {
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const close = () => {
    setStep({ kind: 'idle' });
    setError(undefined);
  };

  async function open() {
    setStatus(undefined);
    try {
      setStep({ kind: 'confirm', replaces: await hasUserData() });
    } catch {
      setStatus('Не удалось проверить текущие данные — попробуйте ещё раз');
    }
  }

  async function load() {
    setBusy(true);
    try {
      await loadDemoData(today ?? todayKey());
      close();
      setStatus('Демо-данные загружены');
    } catch {
      setError('Не удалось загрузить демо-данные — ваши данные не изменились');
    }
    setBusy(false);
  }

  return (
    <Card title="Демо-данные">
      <p className="mb-3 text-sm text-zinc-500">
        Пример за {DEMO_DAYS} дней во всех блоках и экзамен IELTS через {DEMO_EVENT_IN_DAYS} дней — чтобы показать
        приложение и проверить сценарии.
      </p>
      <Button variant="secondary" onClick={() => void open()}>
        Заполнить демо-данными
      </Button>
      {status && (
        <p role="status" className="mt-3 text-sm">
          {status}
        </p>
      )}
      <Sheet open={step.kind === 'confirm'} title="Заполнить демо-данными?" onClose={close}>
        {step.kind === 'confirm' && step.replaces ? (
          <div role="alert" className="mb-4 text-sm text-amber-800 dark:text-amber-300">
            <p className="font-medium">Все ваши текущие данные будут заменены демо-данными.</p>
            <p className="mt-1">Сначала сделайте экспорт, чтобы потом их восстановить.</p>
          </div>
        ) : (
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Приложение заполнится примером за {DEMO_DAYS} дней. Удалить его можно импортом своей копии.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        {step.kind === 'confirm' && step.replaces && (
          <Button className="mb-3 w-full" onClick={() => void onExport()}>
            Сначала экспорт
          </Button>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={close}>
            Отмена
          </Button>
          <Button
            variant={step.kind === 'confirm' && step.replaces ? 'danger' : 'primary'}
            disabled={busy}
            onClick={() => void load()}
          >
            {step.kind === 'confirm' && step.replaces ? 'Заменить' : 'Заполнить'}
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}
