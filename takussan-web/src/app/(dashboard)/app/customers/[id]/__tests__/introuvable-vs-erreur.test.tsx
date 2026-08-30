import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * AC3 — « un identifiant invalide et une erreur réseau rendent DEUX écrans distincts » (TCK-382).
 *
 * ## Ce qui rend cet AC piégeux, et ce que ce fichier fait donc en plus
 *
 * Une page qui appellerait `notFound()` sur TOUT — 404 comme panne — cocherait « l'introuvable
 * est rendu » sans rien distinguer, et rendrait même l'AC2 vert. Les quatre cas sont donc
 * éprouvés ENSEMBLE, et deux d'entre eux affirment une NON-occurrence :
 *
 *   identifiant illisible → notFound()          l'API répond 404 → notFound()
 *   l'API répond 403      → écran d'accès       l'API tombe (500) → l'exception REMONTE,
 *                           refusé, PAS notFound()                  et notFound() n'est PAS appelé
 *
 * La quatrième ligne est celle qui a de la valeur : sans elle, fondre la panne dans l'introuvable
 * passerait au vert. La troisième garde la frontière avec TCK-378 — *403 n'est pas 404*.
 */
const notFoundMock = vi.fn(() => {
  // `notFound()` LÈVE, il ne rend pas. Un mock muet laisserait le composant continuer et le test
  // observerait un arbre que la production ne produit jamais.
  throw new Error('NEXT_NOT_FOUND');
});
const redirectMock = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); });

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ['agent'], agency_id: 3 }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/auth/guards', () => ({ assertCanReachAgentArea: () => {} }));

const fetchCustomerMock = vi.fn();
vi.mock('@/lib/queries/customers', () => ({
  fetchDashboardCustomer: (...a: unknown[]) => fetchCustomerMock(...a),
  fetchCustomerNotes: async () => [],
  fetchCustomerRelationships: async () => [],
  fetchCrmTags: async () => [],
}));

vi.mock('@/components/customer-dashboard/CustomerDetailTabs', () => ({ CustomerDetailTabs: () => null }));
vi.mock('@/components/customer-dashboard/CustomerTagPickerSection', () => ({ CustomerTagPickerSection: () => null }));
vi.mock('@/components/documents/AddDocumentButton', () => ({ AddDocumentButton: () => null }));

const { ApiError } = await import('@/lib/api');
const { default: Page } = await import('../page');

const rendu = (id: string) => Page({ params: Promise.resolve({ id }) });

beforeEach(() => {
  notFoundMock.mockClear();
  redirectMock.mockClear();
  fetchCustomerMock.mockReset();
});

describe('TCK-382 / AC3 — fiche client : l’introuvable et la panne ne se disent pas pareil', () => {
  /**
   * ⚠ **Les deux cas d'introuvable — identifiant illisible et 404 de l'API — ont déménagé dans
   * `[id]/layout.tsx` (TCK-442).** Ce n'était pas un déplacement de confort : dans la page, sous
   * le `loading.tsx` de ce segment, ce `notFound()` rendait **200**, avec l'écran introuvable
   * affiché quand même. Ils sont éprouvés pour les huit segments par
   * `app/__tests__/introuvable-de-detail.test.tsx`.
   *
   * Ce qui reste ici est la distinction que ce fichier existe pour tenir, et qui appartient bien
   * à la page : 403 ≠ 500 ≠ succès.
   */
  it('la page ne décide plus AUCUN introuvable — c’est le layout qui le porte', async () => {
    // Le pendant obligatoire : sans lui, remettre un `notFound()` dans la page — donc réintroduire
    // le 200 — laisserait ce fichier vert.
    fetchCustomerMock.mockRejectedValue(new ApiError(404, 'Not Found'));
    await expect(rendu('999')).rejects.toThrow('API error 404');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('403 de l’API → accès refusé, et surtout PAS introuvable', async () => {
    // 403 dit « cette fiche existe et n'est pas la vôtre ». La fondre dans l'introuvable ferait
    // mentir l'écran — c'est la frontière que TCK-378 tient de son côté.
    fetchCustomerMock.mockRejectedValue(new ApiError(403, 'Forbidden'));
    const arbre = await rendu('7');
    expect(notFoundMock).not.toHaveBeenCalled();
    // Le libellé vient de `crm.customerDetail.forbidden_title` — le VRAI fr.json, via le harnais
    // d'intl : si l'écran devenait l'introuvable, ce titre disparaîtrait.
    expect(JSON.stringify(arbre)).toContain('Accès');
  });

  it('panne réseau (500) → l’exception remonte à la frontière d’erreur, PAS l’introuvable', async () => {
    const panne = new ApiError(500, 'Internal Server Error');
    fetchCustomerMock.mockRejectedValue(panne);
    await expect(rendu('7')).rejects.toBe(panne);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
