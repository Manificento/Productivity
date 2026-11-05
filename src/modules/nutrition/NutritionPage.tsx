import { Page } from '../../ui';
import { FoodTab } from './components/FoodTab';
import { WeightCard } from './components/WeightCard';

/** `/nutrition` — weight log and trend (#108) above the food diary (#107). */
export function NutritionPage() {
  return (
    <Page title="Питание">
      <WeightCard />
      <FoodTab />
    </Page>
  );
}
