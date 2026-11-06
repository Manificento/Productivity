import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Empty, Page } from '../../ui';
import { NbackTrainer, type NbackFinish } from './components/NbackTrainer';
import { saveNbackSession, useNbackSessions } from './data/mindSessions';
import { nextLevel, parseNbackDurationParam } from './logic/nback';
import { useSearchParams } from 'react-router-dom';

type SaveStatus = 'saving' | 'saved' | 'error';

const SAVE_MESSAGES: Record<SaveStatus, string> = {
  saving: 'Сохраняю результат…',
  saved: 'Результат сохранён.',
  error: 'Не удалось сохранить результат. Попробуйте ещё раз.',
};

function isTestMode(): boolean {
  return import.meta.env.DEV || navigator.webdriver === true;
}

/** `/cognition/nback` — instruction, the 3-minute session, results. */
export function NbackPage({ random }: { random?: () => number }) {
  const [params] = useSearchParams();
  const durationMs = parseNbackDurationParam(params.get('duration'), isTestMode());
  const sessions = useNbackSessions();
  const [finished, setFinished] = useState<{ run: NbackFinish; status: SaveStatus } | null>(null);

  const onFinish = useCallback((run: NbackFinish) => {
    setFinished({ run, status: 'saving' });
    saveNbackSession(run).then(
      () => setFinished({ run, status: 'saved' }),
      () => setFinished({ run, status: 'error' }),
    );
  }, []);

  if (sessions === undefined) {
    return (
      <Page title="n-back">
        <Empty>Загружаю…</Empty>
      </Page>
    );
  }

  if (finished) {
    const { run, status } = finished;
    const next = nextLevel(sessions);
    return (
      <Page title="n-back">
        <Card title="Результат">
          <dl className="mb-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt>Уровень</dt>
            <dd className="text-right font-semibold tabular-nums">n = {run.level}</dd>
            <dt>Точность</dt>
            <dd className="text-right font-semibold tabular-nums">{run.accuracyPct}%</dd>
            <dt>Среднее время реакции</dt>
            <dd className="text-right font-semibold tabular-nums">
              {run.meanRtMs === undefined ? '—' : `${run.meanRtMs} мс`}
            </dd>
            <dt>Ошибки</dt>
            <dd className="text-right font-semibold tabular-nums">{run.errors}</dd>
          </dl>
          <p
            role={status === 'error' ? 'alert' : 'status'}
            className={`mb-2 text-sm ${status === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500'}`}
          >
            {SAVE_MESSAGES[status]}
          </p>
          {status === 'saved' && (
            <p className="mb-4 text-sm text-zinc-500">
              {next > run.level
                ? `Отлично! Следующая сессия — n = ${next}.`
                : next < run.level
                  ? `Следующая сессия — легче: n = ${next}.`
                  : `Следующая сессия — n = ${next}.`}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setFinished(null)}
              disabled={status === 'saving'}
            >
              Ещё раз
            </Button>
            <Link
              to="/cognition"
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Готово
            </Link>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page title="n-back">
      <NbackTrainer level={nextLevel(sessions)} durationMs={durationMs} random={random} onFinish={onFinish} />
    </Page>
  );
}
