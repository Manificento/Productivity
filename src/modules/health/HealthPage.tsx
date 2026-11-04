import { Navigate, Route, Routes } from 'react-router-dom';
import { Page } from '../../ui';
import { SleepTab } from './components/SleepTab';

/** `/health` — the sleep block: log, chart and tonight's goal. Food and workouts live in their own blocks (#107). */
export function HealthPage() {
  return (
    <Page title="Сон">
      <Routes>
        <Route index element={<SleepTab />} />
        {/* Old tab links (before #107) go to the blocks that now hold that content. */}
        <Route path="food" element={<Navigate to="/nutrition" replace />} />
        <Route path="workouts" element={<Navigate to="/training" replace />} />
        <Route path="*" element={<Navigate to="/health" replace />} />
      </Routes>
    </Page>
  );
}
