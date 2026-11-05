import { Page } from '../../ui';
import { ProgramsSection } from './components/ProgramsSection';
import { WorkoutsTab } from './components/WorkoutsTab';

/** `/training` — programs with today's session, then the workout log (moved from «Здоровье», #107). */
export function TrainingPage() {
  return (
    <Page title="Тренировки">
      <ProgramsSection />
      <WorkoutsTab />
    </Page>
  );
}
