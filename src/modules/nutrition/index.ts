import type { AppModule } from '../../app/moduleTypes';
import { NutritionPage } from './NutritionPage';

/** «Питание»: food diary, Open Food Facts search and own foods (moved from health, #107). */
export const nutritionModule: AppModule = {
  id: 'nutrition',
  title: 'Питание',
  path: '/nutrition/*',
  icon: '🥗',
  group: 'body',
  summary: 'Дневник еды, КБЖУ и поиск Open Food Facts',
  Page: NutritionPage,
};
