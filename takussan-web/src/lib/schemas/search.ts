import { z } from 'zod';
import { msgValidation } from './messages';

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

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * `searchFiltersSchema` a été SUPPRIMÉ ici — TCK-335.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Son docblock affirmait « These mirror `SearchFilters` ». C'était faux : il portait
 * 18 clés contre 20, `floor_number` et `available_from` manquaient, et personne ne
 * s'en était aperçu parce qu'il n'avait **aucun consommateur de production** — seul
 * son propre test l'importait.
 *
 * C'est le pire état pour une liste : elle a l'autorité d'un schéma, elle a divergé,
 * et rien ne peut le signaler. Une liste morte n'est pas inerte — elle absorbe les
 * corrections sans les rendre, exactement comme le second répertoire de compétences
 * de TCK-303.
 *
 * La parité qui compte est désormais gardée là où elle traverse réellement deux
 * runtimes : `src/types/__tests__/search-filters.parity.test.ts` compare `SearchFilters`
 * aux règles de `SearchPublicPropertyRequest` et à ce que `PropertySearchService`
 * consomme, en lisant les fichiers PHP.
 */

/**
 * Payload accepted by `POST /api/saved-searches`.
 * Backend field `criteria` stores the filter JSON; `notification_frequency`
 * controls digest emails (default: 'off').
 */
export const savedSearchPayloadSchema = z.object({
  name: z.string().trim().min(1, msgValidation('search.savedSearchNameRequired')).max(100),
  criteria: z.record(z.string(), z.unknown()),
  notification_frequency: z
    .enum(['off', 'daily', 'weekly', 'instant'])
    .default('off'),
});

export type SavedSearchPayload = z.infer<typeof savedSearchPayloadSchema>;
