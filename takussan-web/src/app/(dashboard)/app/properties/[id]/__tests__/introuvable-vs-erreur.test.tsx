import { describe, expect, it, vi, beforeEach } from 'vitest';

import fr from '@/messages/fr.json';

/**
 * AC2 nomme explicitement `/app/properties/999`. La page appelait déjà `notFound()` sur un 404
 * (l. 43 avant TCK-382) — mais rien ne le gardait, et surtout il n'existait AUCUN
 * `not-found.tsx` : ce `notFound()` rendait la page 404 par défaut de Next, hors du shell.
 *
 * ⚠ **DEUX des quatre issues ont déménagé avec TCK-442, et ce fichier a suivi.**
 *
 * · Le **404** est décidé par `[id]/layout.tsx`, au-dessus du `loading.tsx` de ce segment : dans
 *   la page, il rendait 200 avec l'écran introuvable affiché quand même. Il est éprouvé, pour les
 *   huit segments d'un coup, par `app/__tests__/introuvable-de-detail.test.tsx`.
 * · Le **403** ne redirige plus vers `/app` : il rend un panneau « accès refusé », comme
 *   `customers/[id]` le faisait déjà. Un `redirect()` de page sous un repli rendait 200 + le
 *   squelette au lieu du 307, et surtout il ne DISAIT rien.
 *
 * Restent ici les deux issues que la page décide encore, et c'est bien à elle de les décider :
 * la panne qui remonte, et le bien qui se rend.
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

describe('TCK-382 / TCK-442 — fiche de bien : quatre causes, quatre issues', () => {
  it('403 de l’API → un panneau « accès refusé » RENDU, ni introuvable ni redirection', async () => {
    fetchPropertyMock.mockRejectedValue(new ApiError(403, 'Forbidden'));

    const arbre = await rendu('9');
    // Le panneau porte les trois libellés du dictionnaire, et il propose le retour à la liste :
    // c'est ce qu'un `redirect('/app')` muet ne faisait pas.
    // Les libellés VIENNENT du dictionnaire — jamais recopiés ici : une chaîne écrite en dur
    // resterait verte le jour où la clé disparaîtrait des trois langues.
    const libelles = fr.dashboard.pages.propertyDetail;
    const rendu_ = JSON.stringify(arbre);
    expect(rendu_).toContain(libelles.forbidden_title);
    expect(rendu_).toContain(libelles.back_cta);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
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
