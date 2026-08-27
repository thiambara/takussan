import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * AC2 nomme explicitement `/app/properties/999`. La page appelait déjà `notFound()` sur un 404
 * (l. 43 avant ce ticket) — mais rien ne le gardait, et surtout il n'existait AUCUN
 * `not-found.tsx` : ce `notFound()` rendait la page 404 par défaut de Next, hors du shell. Le
 * comportement de la page ne change donc pas ici ; ce qui change, c'est l'écran qu'il produit,
 * plus le fait qu'une régression sur ces quatre branches soit désormais rouge.
 */
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
const redirectMock = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); });
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ['agent'] }) }));
vi.mock('@/lib/auth/guards', () => ({ assertCanReachAgentArea: () => {} }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));

const getTokenMock = vi.fn(async () => 'jeton' as string | null);
vi.mock('@/lib/session', () => ({ getToken: () => getTokenMock() }));

const fetchPropertyMock = vi.fn();
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperty: (...a: unknown[]) => fetchPropertyMock(...a),
}));
vi.mock('@/components/property-dashboard/PropertyDetailTabs', () => ({ PropertyDetailTabs: () => null }));
vi.mock('@/components/property-dashboard/PropertyHeaderActions', () => ({ PropertyHeaderActions: () => null }));
vi.mock('@/components/property-dashboard/PropertyStatusBadge', () => ({ PropertyStatusBadge: () => null }));
vi.mock('@/components/property-dashboard/PropertyVisibilityBadge', () => ({ PropertyVisibilityBadge: () => null }));
vi.mock('@/components/property-form/PropertyModerationBanner', () => ({ PropertyModerationBanner: () => null }));

const { ApiError } = await import('@/lib/api');
const { default: Page } = await import('../page');
const rendu = (id: string) => Page({ params: Promise.resolve({ id }) });

beforeEach(() => {
  notFoundMock.mockClear();
  redirectMock.mockClear();
  getTokenMock.mockResolvedValue('jeton');
  fetchPropertyMock.mockReset();
});

describe('TCK-382 / AC2-AC3 — fiche de bien : quatre causes, quatre issues', () => {
  it('404 de l’API → introuvable', async () => {
    fetchPropertyMock.mockRejectedValue(new ApiError(404, 'Not Found'));
    await expect(rendu('999')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('403 de l’API → renvoi vers /app, PAS l’introuvable', async () => {
    fetchPropertyMock.mockRejectedValue(new ApiError(403, 'Forbidden'));
    await expect(rendu('9')).rejects.toThrow('NEXT_REDIRECT:/app');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('panne réseau (500) → l’exception remonte, PAS l’introuvable', async () => {
    const panne = new ApiError(500, 'Internal Server Error');
    fetchPropertyMock.mockRejectedValue(panne);
    await expect(rendu('9')).rejects.toBe(panne);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('bien existant → la fiche', async () => {
    fetchPropertyMock.mockResolvedValue({
      id: 9, title: 'Villa Ngor', reference_number: 'REF-9',
      status: 'published', visibility: 'public', location: { city: 'Dakar' },
    });
    const arbre = await rendu('9');
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(JSON.stringify(arbre)).toContain('Villa Ngor');
  });
});
