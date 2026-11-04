import { Page } from '../../ui';
import { WorkoutsTab } from './components/WorkoutsTab';

/** `/training` — the workout log (moved from «Здоровье», #107). */
export function TrainingPage() {
  return (
    <Page title="Тренировки">
      <WorkoutsTab />
    </Page>
  );
}
