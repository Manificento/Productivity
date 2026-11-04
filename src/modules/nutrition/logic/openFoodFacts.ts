import { z } from 'zod';
import type { FoodInput } from './nutrition';

/** The only external API the app talks to (docs/architecture.md). */
export const OFF_SEARCH_ENDPOINT = 'https://world.openfoodfacts.org/cgi/search.pl';

export function offSearchUrl(query: string): string {
  const params = new URLSearchParams({
    search_terms: query.trim(),
    search_simple: '1',
    json: '1',
    page_size: '20',
    fields: 'code,product_name,product_name_ru,nutriments',
  });
  return `${OFF_SEARCH_ENDPOINT}?${params}`;
}

/** A product found in Open Food Facts, values per 100 g. */
export interface OffFood extends FoodInput {
  externalId: string;
}

/** OFF sends numbers sometimes as strings, sometimes empty. */
const num = z.union([z.number(), z.string()]).optional();

const Product = z.object({
  code: z.string().min(1),
  product_name: z.string().optional(),
  product_name_ru: z.string().optional(),
  nutriments: z
    .object({
      'energy-kcal_100g': num,
      proteins_100g: num,
      fat_100g: num,
      carbohydrates_100g: num,
    })
    .partial()
    .optional(),
});

const Response = z.object({ products: z.array(z.unknown()) });

function toNumber(v: number | string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Validates an OFF search response. Products without a name or calories are skipped;
 * missing protein/fat/carbs count as 0. Throws when the response itself has an unexpected shape.
 */
export function parseOffResponse(json: unknown): OffFood[] {
  const { products } = Response.parse(json);
  return products.flatMap((raw) => {
    const p = Product.safeParse(raw);
    if (!p.success) return [];
    const { code, product_name_ru, product_name, nutriments = {} } = p.data;
    const name = (product_name_ru?.trim() || product_name?.trim()) ?? '';
    const kcal = toNumber(nutriments['energy-kcal_100g']);
    if (!name || kcal === undefined) return [];
    return [
      {
        externalId: code,
        name,
        kcal,
        protein: toNumber(nutriments.proteins_100g) ?? 0,
        fat: toNumber(nutriments.fat_100g) ?? 0,
        carbs: toNumber(nutriments.carbohydrates_100g) ?? 0,
      },
    ];
  });
}
