import { useEffect, useState } from 'react';
import {
  getCapabilities,
  isNativePlatform,
  isNightSensingActive,
  NIGHT_SENSING_TEXTS,
  startNightSensing,
  stopNightSensing,
} from '../../../core/platform';
import { Button, Card, Empty } from '../../../ui';

/**
 * «Спать» (#249): starts night sensing — movement and noise level, one aggregate a minute, also with the app closed
 * (`startNightSensing` in `platform.ts`). The smart alarm reads it inside the wake window (#250); the morning record
 * with stages is #130. Manual entry below stays as it was.
 */
export function NightSensingCard() {
  const available = getCapabilities().backgroundSensors;
  const [active, setActive] = useState<boolean>();
  const [hint, setHint] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!available) return;
    let alive = true;
    void isNightSensingActive().then((a) => {
      if (alive) setActive(a);
    });
    return () => {
      alive = false;
    };
  }, [available]);

  if (!available) {
    return (
      <Card title="Трекинг сна">
        <Empty>{isNativePlatform() ? NIGHT_SENSING_TEXTS.nativeUnsupported : NIGHT_SENSING_TEXTS.web}</Empty>
      </Card>
    );
  }

  async function start() {
    setBusy(true);
    setHint(undefined);
    const result = await startNightSensing();
    if (result.status === 'started') setActive(true);
    else setHint(result.hint);
    setBusy(false);
  }

  async function stop() {
    setBusy(true);
    await stopNightSensing();
    setActive(await isNightSensingActive());
    setBusy(false);
  }

  return (
    <Card title="Трекинг сна">
      {active === undefined ? (
        <Empty>Загрузка…</Empty>
      ) : active ? (
        <>
          <p role="status" className="mb-3 text-sm">
            Идёт запись ночи: движение и уровень шума раз в минуту. Звук не записывается. Положите телефон рядом на
            кровать.
          </p>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void stop()}>
            Остановить запись
          </Button>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            Перед сном нажмите «Спать»: телефон запишет ночь, а будильник разбудит в лёгкой фазе внутри окна.
          </p>
          <Button className="w-full" disabled={busy} onClick={() => void start()}>
            Спать
          </Button>
        </>
      )}
      {hint && (
        <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
          {hint}
        </p>
      )}
    </Card>
  );
}
