import { Navigate, Route, Routes } from 'react-router-dom';
import { Page } from '../../ui';
import { SleepTab } from './components/SleepTab';

/** `/health` — the sleep block: log, chart and tonight's goal. Food and workouts live in their own blocks (#107). */
export function HealthPage() {
  return (
    <Page title="Сон">
      <Routes>
        <Route index element={<SleepTab />} />
        <Route path="*" element={<Navigate to="/health" replace />} />
      </Routes>
    </Page>
  );
}
