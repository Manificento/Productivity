import type { AppModule } from '../../app/moduleTypes';
import { NutritionPage } from './NutritionPage';

/**
 * «Питание» (SPEC 0.3). A skeleton for the `nutrition` lane: no `navOrder` yet, so the block is hidden from
 * the bottom navigation until it has something to show; the route works and shows «скоро».
 */
export const nutritionModule: AppModule = {
  id: 'nutrition',
  title: 'Питание',
  path: '/nutrition/*',
  icon: '🥗',
  Page: NutritionPage,
};
