/**
 * TCK-2671 — la couche de données de la vérification, de l'offre et du passage en pro.
 *
 * - AC4 : une demande refusée se renvoie avec `resubmit_of` et la nouvelle pièce, SANS `ninea` ni
 *   `rib_pro` quand l'admin ne les a pas retapés (l'API les reprend ; ils ne reviennent jamais en
 *   clair au navigateur, ADR-0104 § 5).
 * - Le numéro de la pièce (RCCM, NINEA) part avec elle ; jamais pour la pièce du dirigeant, que l'API
 *   refuse (`prohibited_if`).
 * - Décision 14 : le prix est lu de l'API ; une offre absente (404) rend `null`, jamais un montant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));

import { ApiError } from '@/lib/api';
import { renvoyerUneDemandeRefusee } from '../agency-upgrade';
import { uploadAgencyKycDocument } from '../kyc';
import { fetchOffreDePassage, fetchQuotaDeLAgence } from '../offre';

const PIECE = new File(['%PDF'], 'statuts.pdf', { type: 'application/pdf' });
const corps = () => apiRequest.mock.calls[0][1].body as FormData;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ data: {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renvoyerUneDemandeRefusee (AC4)', () => {
  it('part avec resubmit_of et la pièce, sans ninea ni rib_pro quand ils n’ont pas été retapés', async () => {
    await renvoyerUneDemandeRefusee('jeton', 4, 2, { company_legal_name: 'Studio de Aminata SARL' }, PIECE);
    expect(apiRequest.mock.calls[0][0]).toBe('/api/agencies/4/upgrade-requests');
    expect(apiRequest.mock.calls[0][1]).toMatchObject({ method: 'POST', formData: true, token: 'jeton' });
    const f = corps();
    expect(f.get('resubmit_of')).toBe('2');
    expect(f.get('statuts_doc')).toBe(PIECE);
    expect(f.get('company_legal_name')).toBe('Studio de Aminata SARL');
    expect(f.has('ninea')).toBe(false);
    expect(f.has('rib_pro')).toBe(false);
    expect(f.has('rc')).toBe(false);
    expect(f.has('planned_agents_count')).toBe(false);
  });

  it('un champ vidé ou réduit à des blancs ne part pas : l’API reprend celui de la demande d’origine', async () => {
    await renvoyerUneDemandeRefusee('jeton', 4, 2, { rc: '   ', ninea: '' }, PIECE);
    expect([...corps().keys()].sort()).toEqual(['resubmit_of', 'statuts_doc']);
  });

  it('un NINEA retapé part, comme le nombre d’agents', async () => {
    await renvoyerUneDemandeRefusee('jeton', 4, 2, { ninea: ' 007845126 ', planned_agents_count: 4 }, PIECE);
    expect(corps().get('ninea')).toBe('007845126');
    expect(corps().get('planned_agents_count')).toBe('4');
  });
});

describe('uploadAgencyKycDocument — le numéro de la pièce (TCK-2669)', () => {
  const envoye = () => (vi.mocked(fetch).mock.calls[0][1]!.body as FormData);
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 201 })));
  });

  it('part avec le RCCM, sans les blancs', async () => {
    await uploadAgencyKycDocument(1, 'rccm', PIECE, undefined, ' SN-DKR-2017-B-8841 ');
    expect(envoye().get('document_number')).toBe('SN-DKR-2017-B-8841');
  });

  it('ne part jamais pour la pièce du dirigeant, ni vide', async () => {
    await uploadAgencyKycDocument(1, 'director_id', PIECE, '2031-01-01', 'X');
    expect(envoye().has('document_number')).toBe(false);
    expect(envoye().get('expires_at')).toBe('2031-01-01');
    vi.mocked(fetch).mockClear();
    await uploadAgencyKycDocument(1, 'ninea', PIECE, undefined, '  ');
    expect(envoye().has('document_number')).toBe(false);
  });

  it('un 201 est un succès (le renouvellement rend 201, pas 200)', async () => {
    await expect(uploadAgencyKycDocument(1, 'director_id', PIECE, '2031-01-01')).resolves.toEqual({ data: {} });
  });
});

describe('fetchOffreDePassage — décision 14', () => {
  it('rend le prix tel que l’API le lit', async () => {
    apiRequest.mockResolvedValue({ data: { code: 'pro', label: 'Offre Pro', monthly_price_xof: 65000, platform_fee_pct: 3, limits: {} } });
    expect((await fetchOffreDePassage('jeton'))?.monthly_price_xof).toBe(65000);
    expect(apiRequest.mock.calls[0][0]).toBe('/api/me/upgrade-offer');
  });

  it('une offre absente (404) rend null ; un 403 remonte', async () => {
    apiRequest.mockRejectedValueOnce(new ApiError(404, { code: 'plan.upgrade_offer_missing' }));
    expect(await fetchOffreDePassage('jeton')).toBeNull();
    apiRequest.mockRejectedValueOnce(new ApiError(403, {}));
    await expect(fetchOffreDePassage('jeton')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('fetchQuotaDeLAgence (AC5)', () => {
  it('sépare les biens en ligne (clés plates) et les agents', async () => {
    apiRequest.mockResolvedValue({ data: { limit: 100, used: 67, can_create: true, agents: { limit: 15, used: 9 } } });
    expect(await fetchQuotaDeLAgence('jeton')).toEqual({ biens: { limit: 100, used: 67 }, agents: { limit: 15, used: 9 } });
  });

  it('agents null (lecteur hors de l’équipe) reste null', async () => {
    apiRequest.mockResolvedValue({ data: { limit: null, used: 3, can_create: true, agents: null } });
    expect(await fetchQuotaDeLAgence('jeton')).toEqual({ biens: { limit: null, used: 3 }, agents: null });
  });
});
