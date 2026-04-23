import { z } from 'zod';

/**
 * Zod schemas for search-related payloads.
 *
 * These mirror {@link SearchFilters} at `src/types/search.ts` and are used
 * when serializing filters for saved searches or validating inputs.
 *
 * Wave 3 — TCK-039 / TCK-047.
 */

export const contractTypeSchema = z.enum(['sale', 'rent']);
export const rentPeriodSchema = z.enum(['daily', 'weekly', 'monthly', 'yearly']);
export const sortSchema = z.enum([
  'relevance',
  'price_asc',
  'price_desc',
  'created_desc',
]);

/**
 * URL-shape of the search filters. All values are optional; numeric values
 * are coerced from strings because they originate from `URLSearchParams`.
 */
export const searchFiltersSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().max(200).optional(),
  city: z.string().trim().max(200).optional(),
  contract_type: contractTypeSchema.optional(),
  type: z.array(z.string()).optional(),
  rent_period: rentPeriodSchema.optional(),
  price_min: z.coerce.number().min(0).optional(),
  price_max: z.coerce.number().min(0).optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
  bathrooms: z.coerce.number().int().min(0).optional(),
  area_min: z.coerce.number().min(0).optional(),
  area_max: z.coerce.number().min(0).optional(),
  furnished: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  tags: z.string().optional(),
  sort: sortSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
});

export type SearchFiltersInput = z.input<typeof searchFiltersSchema>;
export type SearchFiltersParsed = z.output<typeof searchFiltersSchema>;

/**
 * Payload accepted by `POST /api/saved-searches`.
 * Backend field `criteria` stores the filter JSON; `notification_frequency`
 * controls digest emails (default: 'off').
 */
export const savedSearchPayloadSchema = z.object({
  name: z.string().trim().min(1, 'Donnez un nom à cette recherche.').max(100),
  criteria: z.record(z.string(), z.unknown()),
  notification_frequency: z
    .enum(['off', 'daily', 'weekly', 'instant'])
    .default('off'),
});

export type SavedSearchPayload = z.infer<typeof savedSearchPayloadSchema>;
