import { useState } from 'react';
import { Button, Card } from '../../../ui';
import { useInstallPrompt } from './installPrompt';

/** «Установить» when the browser can install the app (Chrome on Android); nothing otherwise. */
export function InstallCard() {
  const { canInstall, installed, install } = useInstallPrompt();
  const [error, setError] = useState<string>();
  if (!canInstall && !installed && !error) return null;

  async function onInstall() {
    try {
      setError(undefined);
      await install();
    } catch {
      setError('Браузер не дал установить приложение. Попробуйте через его меню.');
    }
  }

  return (
    <Card title="Приложение на телефоне">
      {installed ? (
        <p className="text-sm">Приложение установлено</p>
      ) : !canInstall ? null : (
        <>
          <p className="mb-3 text-sm text-zinc-500">Иконка на главном экране, запуск без браузера, работа офлайн.</p>
          <Button onClick={() => void onInstall()}>Установить</Button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </Card>
  );
}
