import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCapabilities,
  isNativePlatform,
  isNightSensingActive,
  NIGHT_SENSING_TEXTS,
  startNightSensing,
  stopNightSensing,
} from '../../../core/platform';
import { Button, Card, Empty } from '../../../ui';

/** `started` only means the service was asked to start: confirm a moment later (`platform.ts`). */
export const CONFIRM_START_MS = 1_000;

/**
 * «Спать» (#249): starts night sensing — movement and noise level, one aggregate a minute, also with the app closed
 * (`startNightSensing` in `platform.ts`). The state is re-read when the app comes back to the screen (the OS may end
 * the service at night). Using it — the smart alarm with a window and the morning record with stages — is #130.
 * Manual entry below stays as it was.
 */
export function NightSensingCard() {
  const available = getCapabilities().backgroundSensors;
  const [active, setActive] = useState<boolean>();
  const [hint, setHint] = useState<string>();
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const a = await isNightSensingActive();
    if (alive.current) setActive(a);
    return a;
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!available) return;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [available, refresh]);

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
    if (result.status !== 'started') {
      if (alive.current) setHint(result.hint);
    } else {
      // The service may still fail to start (e.g. Android 14+ refuses a microphone service): check it runs.
      await new Promise((resolve) => setTimeout(resolve, CONFIRM_START_MS));
      if (!(await refresh()) && alive.current) setHint(NIGHT_SENSING_TEXTS.failed);
    }
    if (alive.current) setBusy(false);
  }

  async function stop() {
    setBusy(true);
    // Stopping never fails; the service reports inactive a moment later, so do not wait for it.
    await stopNightSensing();
    if (alive.current) {
      setActive(false);
      setBusy(false);
    }
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
            Перед сном нажмите «Спать»: телефон запишет движение и уровень шума за ночь (звук не записывается).
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
