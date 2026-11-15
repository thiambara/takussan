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
 * Vérification de 416274da0 (TCK-2759, r1) — la bibliothèque (`useDocuments`) et les pièces du
 * bailleur demandent `fields[documents]=DOCUMENT_LIST_FIELDS`. La pastille « Interne » et la bascule
 * « Garder pour l'agence » / « Rendre visible » lisent `is_internal`, et l'offre (`abilities`) se juge
 * sur le porteur et l'auteur : ces colonnes partent avec la liste.
 */
describe('les fields de la liste des documents (TCK-2759 r1)', () => {
  it('portent is_internal, l’auteur et le porteur', () => {
    expect(DOCUMENT_LIST_FIELDS).toEqual(expect.arrayContaining(['is_internal', 'uploaded_by', 'documentable_type', 'documentable_id']));
  });

  it('partent tels quels avec la liste de la bibliothèque', () => {
    renderHook(() => useDocuments({ documentable_type: 'customer', documentable_id: 12 }));
    const [, chemin, options] = appels.at(-1) as [unknown, string, { params: { fields: { documents: readonly string[] } } }];
    expect(chemin).toBe('/api/documents');
    expect(options.params.fields.documents).toContain('is_internal');
    expect(options.params.fields.documents).toEqual(DOCUMENT_LIST_FIELDS);
  });
});
