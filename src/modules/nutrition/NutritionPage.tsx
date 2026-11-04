import { Page } from '../../ui';
import { FoodTab } from './components/FoodTab';

/** `/nutrition` — the food diary (moved from «Здоровье», #107). */
export function NutritionPage() {
  return (
    <Page title="Питание">
      <FoodTab />
    </Page>
  );
}
