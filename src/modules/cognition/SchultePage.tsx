import { useCallback, useState } from 'react';
import { Empty, Page } from '../../ui';
import { MindResult, type MindSaveStatus } from './components/MindResult';
import { SchulteTrainer, type SchulteFinish } from './components/SchulteTrainer';
import { saveSchulteSession, useMindSessions } from './data/mindSessions';
import { compareToAverage, comparisonText, formatSeconds } from './logic/summary';

/** `/cognition/schulte` — instruction, the table, summary. */
export function SchultePage({ random }: { random?: () => number }) {
  const sessions = useMindSessions('schulte');
  const [finished, setFinished] = useState<{ run: SchulteFinish; status: MindSaveStatus; comparison?: string } | null>(
    null,
  );

  const onFinish = useCallback(
    (run: SchulteFinish) => {
      setFinished({ run, status: 'saving' });
      const earlier = (sessions ?? []).map((x) => x.durationMs);
      saveSchulteSession(run).then(
        () =>
          setFinished({
            run,
            status: 'saved',
            comparison: comparisonText(compareToAverage(run.durationMs, earlier, true), formatSeconds),
          }),
        () => setFinished({ run, status: 'error' }),
      );
    },
    [sessions],
  );

  if (sessions === undefined)
    return (
      <Page title="Таблица Шульте">
        <Empty>Загружаю…</Empty>
      </Page>
    );

  if (finished) {
    const { run, status, comparison } = finished;
    return (
      <Page title="Таблица Шульте">
        <MindResult
          rows={[
            ['Время', formatSeconds(run.durationMs)],
            ['Ошибки', String(run.errors)],
            ['Точность', `${run.accuracyPct}%`],
          ]}
          status={status}
          comparison={comparison}
          onRetry={() => setFinished(null)}
        />
      </Page>
    );
  }

  return (
    <Page title="Таблица Шульте">
      <SchulteTrainer random={random} onFinish={onFinish} />
    </Page>
  );
}
