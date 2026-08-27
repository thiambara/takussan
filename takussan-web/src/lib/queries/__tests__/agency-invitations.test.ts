import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApiRequest = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...reel,
    // `buildQueryString` reste le VRAI : c'est lui qu'on éprouve ici, à travers
    // l'URL qu'il produit. Ne bouchonner que le transport.
    apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  };
});

const { fetchPendingAgencyInvitations, resendInvitation, revokeInvitation } = await import(
  '@/lib/queries/agency-invitations'
);
const owners = await import('@/lib/queries/owners');

function urlAppelee(): string {
  return String(mockApiRequest.mock.calls[0][0]);
}

describe('agency-invitations', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, per_page: 10, total: 0 } });
  });

  it('lit /api/invitations avec un sparse fieldset, filter[status]=sent et un tri', async () => {
    await fetchPendingAgencyInvitations('jeton');

    const url = urlAppelee();
    expect(url.startsWith('/api/invitations?')).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('fields[invitations]')).toBe(
      'id,email,role,status,agency_id,expires_at,created_at',
    );
    expect(params.get('filter[status]')).toBe('sent');
    expect(params.get('sort')).toBe('-created_at');
    expect(mockApiRequest.mock.calls[0][1]).toMatchObject({ token: 'jeton' });
  });

  /**
   * Contrainte stricte du ticket. Le test porte sur l'URL RÉELLEMENT construite,
   * pas sur les paramètres passés à `buildQueryString` : c'est l'URL qui part.
   */
  it("n'envoie JAMAIS de filter[agency_id] — la portée vient du profil actif côté serveur", async () => {
    await fetchPendingAgencyInvitations('jeton', { page: 3, perPage: 25 });

    const url = urlAppelee();
    const params = new URLSearchParams(url.split('?')[1]);
    // ⚠ `agency_id` figure légitimement dans `fields[invitations]` — la colonne est
    // lue et rendue. C'est le FILTRE qui est interdit, pas le nom : chercher la
    // sous-chaîne nue rendrait ce test vert pour la mauvaise raison, ou rouge
    // pour aucune.
    expect(params.get('filter[agency_id]')).toBeNull();
    expect([...params.keys()].filter((k) => k.startsWith('filter['))).toEqual(['filter[status]']);
    expect(params.get('page')).toBe('3');
    expect(params.get('per_page')).toBe('25');
  });

  /**
   * AC5 — « aucun de ces appels n'est une re-déclaration de ce que `owners.ts`
   * expose déjà ». L'identité de fonction le prouve par exécution : deux
   * déclarations distinctes, même à corps identique, échoueraient ici.
   */
  it('réutilise les mutations de owners.ts au lieu de les redéclarer', () => {
    expect(resendInvitation).toBe(owners.resendInvitation);
    expect(revokeInvitation).toBe(owners.revokeInvitation);
  });
});
