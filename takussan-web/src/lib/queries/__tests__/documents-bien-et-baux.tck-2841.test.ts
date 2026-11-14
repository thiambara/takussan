import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const appels = vi.hoisted(() => [] as unknown[][]);

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => {
    appels.push(args);
    return { data: undefined, isLoading: false };
  },
  useApiMutation: vi.fn(),
}));

const { DOCUMENT_LIST_FIELDS, useDocuments } = await import('@/lib/queries/documents');

/**
 * TCK-2841 (ADR-0099, amendement du 2026-11-14) — la couture entre l'onglet Documents d'un bien et l'API :
 * `useDocuments({ property_with_leases })` envoie `filter[property_with_leases]`, sans cible simple, avec les
 * `fields[documents]` de la liste. Sans ce filtre, l'API rendrait les seuls téléversements de l'appelant.
 */
describe('useDocuments — le bien et ses baux (TCK-2841)', () => {
  it('envoie filter[property_with_leases], et ni documentable_type ni documentable_id', () => {
    renderHook(() => useDocuments({ property_with_leases: 9, per_page: 100 }));
    const [, chemin, options] = appels.at(-1) as [unknown, string, { params: { filter: Record<string, unknown>; fields: { documents: readonly string[] }; per_page: number } }];
    expect(chemin).toBe('/api/documents');
    expect(options.params.filter).toEqual({ property_with_leases: 9 });
    expect(options.params.fields.documents).toEqual(DOCUMENT_LIST_FIELDS);
    expect(options.params.per_page).toBe(100);
  });
});
