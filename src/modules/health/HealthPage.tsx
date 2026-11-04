import { Navigate, Route, Routes } from 'react-router-dom';
import { Page, Tabs } from '../../ui';
import { FoodTab } from './components/FoodTab';
import { SleepTab } from './components/SleepTab';
import { WorkoutsTab } from './components/WorkoutsTab';

export function HealthPage() {
  return (
    <Page title="Здоровье">
      <Tabs
        items={[
          { to: '/health', label: 'Сон', end: true },
          { to: '/health/food', label: 'Еда' },
          { to: '/health/workouts', label: 'Тренировки' },
        ]}
      />
      <Routes>
        <Route index element={<SleepTab />} />
        <Route path="food" element={<FoodTab />} />
        <Route path="workouts" element={<WorkoutsTab />} />
        <Route path="*" element={<Navigate to="/health" replace />} />
      </Routes>
    </Page>
  );
}
