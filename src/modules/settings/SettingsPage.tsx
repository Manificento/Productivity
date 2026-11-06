import { useRef, useState } from 'react';
import { exportAll, importAll } from '../../core/backup';
import { todayKey } from '../../core/dates';
import { Button, Card, Page } from '../../ui';
import { DemoDataCard } from './components/DemoDataCard';
import { InstallCard } from './components/InstallCard';
import { TodoistImportCard } from './components/TodoistImportCard';

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>();

  async function onExport() {
    const backup = await exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifeos-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Резервная копия сохранена');
  }

  async function onImport(file: File) {
    if (!confirm('Импорт заменит ВСЕ текущие данные. Продолжить?')) return;
    try {
      await importAll(JSON.parse(await file.text()));
      setStatus('Данные восстановлены');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Не удалось импортировать файл');
    }
  }

  return (
    <Page title="Настройки">
      <InstallCard />
      <Card title="Резервная копия">
        <p className="mb-3 text-sm text-zinc-500">
          Все данные хранятся только на этом устройстве. Делайте копию регулярно и перед сменой телефона.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExport}>Экспорт в JSON</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Импорт из JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
          />
        </div>
        {status && <p className="mt-3 text-sm">{status}</p>}
      </Card>
      <TodoistImportCard />
      <DemoDataCard onExport={onExport} />
    </Page>
  );
}
