import { Route, Routes } from 'react-router-dom';
import { HabitDetail } from './components/HabitDetail';
import { HabitsList } from './components/HabitsList';

export function HabitsPage() {
  return (
    <Routes>
      <Route index element={<HabitsList />} />
      <Route path=":id" element={<HabitDetail />} />
    </Routes>
  );
}
