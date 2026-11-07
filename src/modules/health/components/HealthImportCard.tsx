import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useState } from 'react';
import {
  getCapabilities,
  getPlatform,
  HEALTH_TEXTS,
  isNativePlatform,
  openHealthSettings,
} from '../../../core/platform';
import type { DateKey } from '../../../core/types';
import { Button, Card, Empty } from '../../../ui';
import {
  connectHealthImport,
  disconnectHealthImport,
  runHealthImport,
  useHealthImport,
  type HealthImportOutcome,
} from '../data/healthImport';
import { IMPORT_DAYS } from '../logic/healthImport';

/** The criterion's wording («доступно в приложении для телефона»). */
export const HEALTH_IMPORT_WEB_TEXT = 'Импорт сна и тренировок доступен в приложении для телефона.';

function Outcome({ result }: { result: HealthImportOutcome }) {
  if (result.status === 'ok') {
    return (
      <div className="mt-2 text-sm">
        <p role="status">
          Из импорта в LifeOS за {IMPORT_DAYS} дней: ночей {result.nights}, тренировок {result.workouts}
        </p>
        {result.hint && <p className="text-zinc-500">{result.hint}</p>}
      </div>
    );
  }
  return (
    <div className="mt-2">
      <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
        {result.hint}
      </p>
      <p className="text-sm text-zinc-500">Сон можно записать вручную ниже.</p>
      {result.status === 'denied' && getPlatform() === 'android' && (
        <Button variant="secondary" className="mt-2 w-full" onClick={() => void openHealthSettings()}>
          Открыть Health Connect
        </Button>
      )}
    </div>
  );
}

/** «Импорт из Health Connect / Здоровья» on «Сон» (#131): connect, refresh, disconnect; refusal → manual entry. */
export function HealthImportCard({ today }: { today: DateKey }) {
  const state = useHealthImport();
  const [result, setResult] = useState<HealthImportOutcome>();
  const [busy, setBusy] = useState(false);
  const store = getPlatform() === 'ios' ? '«Здоровья»' : 'Health Connect';
  const title = `Импорт из ${store}`;

  if (!getCapabilities().healthImport) {
    return (
      <Card title="Импорт сна и тренировок">
        <Empty>{isNativePlatform() ? HEALTH_TEXTS.nativeUnsupported : HEALTH_IMPORT_WEB_TEXT}</Empty>
      </Card>
    );
  }
  if (state === undefined) {
    return (
      <Card title={title}>
        <Empty>Загрузка…</Empty>
      </Card>
    );
  }

  const act = async (job: () => Promise<HealthImportOutcome | void>) => {
    setBusy(true);
    try {
      const outcome = await job();
      setResult(outcome ?? undefined);
    } catch {
      setResult({ status: 'failed', hint: HEALTH_TEXTS.failed });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={title}>
      {state.enabled ? (
        <>
          <p className="text-sm">
            Импорт включён: сон и тренировки за {IMPORT_DAYS} дней приходят сами, когда вы открываете LifeOS.
          </p>
          {state.lastError && !result && <Outcome result={{ status: 'denied', hint: state.lastError }} />}
          {state.lastRunAt !== undefined && (
            <p className="text-xs text-zinc-500">
              Последний раз: {format(state.lastRunAt, 'd MMMM, H:mm', { locale: ru })}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button disabled={busy} onClick={() => void act(() => runHealthImport(today))}>
              Обновить
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void act(disconnectHealthImport)}>
              Отключить
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            Сон и тренировки за {IMPORT_DAYS} дней из {store} — без ручного ввода. Читаются только сон и тренировки,
            данные остаются на телефоне.
          </p>
          <Button className="mt-3 w-full" disabled={busy} onClick={() => void act(() => connectHealthImport(today))}>
            Подключить
          </Button>
        </>
      )}
      {result && <Outcome result={result} />}
    </Card>
  );
}
