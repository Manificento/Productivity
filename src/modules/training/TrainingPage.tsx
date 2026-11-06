import { useTodayKey } from '../../core/dates';
import { Page } from '../../ui';
import { ProgramsSection } from './components/ProgramsSection';
import { WorkoutsTab } from './components/WorkoutsTab';

/** `/training` — programs with today's session, then the workout log (moved from «Здоровье», #107). */
export function TrainingPage() {
  // Follows local midnight while the page stays open: today's session and the log switch to the new day.
  const today = useTodayKey();
  return (
    <Page title="Тренировки">
      <ProgramsSection today={today} />
      <WorkoutsTab today={today} />
    </Page>
  );
}
