import { Page } from '../../ui';
import { FoodTab } from './components/FoodTab';
import { GoalCard } from './components/GoalCard';
import { WeightCard } from './components/WeightCard';

/** `/nutrition` — weight (#108), goal and targets (#109), food diary (#107). */
export function NutritionPage() {
  return (
    <Page title="Питание">
      <WeightCard />
      <GoalCard />
      <FoodTab />
    </Page>
  );
}
