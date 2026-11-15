import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2613 — `/onboarding/service-provider` passe à l'assistant d'un profil brouillon ce que son écran 2 montre :
 * l'intervention jointe à l'invitation (`/intervention-d-origine`, champs minimaux nommés), les réglages du profil,
 * les pièces de CE profil (`X-Profile-Id`) et l'agence de la collaboration qui attend (`paused`). Une lecture en
 * échec n'empêche pas d'entrer.
 */

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
const profil = vi.hoisted(() => ({ statut: 'draft' }));
vi.mock('@/app/actions/profiles', () => ({
  getMyProfilesAction: async () => ({
    ok: true,
    data: { data: [{ type: 'service_provider', numeric_id: 31, status: profil.statut }] },
  }),
}));
const getSpAgenciesAction = vi.hoisted(() => vi.fn());
vi.mock('@/app/actions/service-provider-onboarding', () => ({ getSpAgenciesAction }));
vi.mock('@/components/onboarding/ServiceProviderMultiAgencyWelcome', () => ({ ServiceProviderMultiAgencyWelcome: () => null }));

const INTERVENTION = { id: 501, title: 'Fuite sous évier', category: 'plumbing', place: { quarter: 'Mermoz', city: 'Dakar' } };
const REGLAGES = { id: 31, trades: ['plumbing'], intervention_zones: [], hourly_rate: null, visit_fee: null, available_slots: [] };
const PIECES = [{ code: 'insurance', required: false, kind: 'file', state: 'missing' }];
const AGENCES = [
  { collaboration_id: 4, agency_id: 2, agency: { id: 2, name: 'Ancienne agence' }, status: 'ended' },
  { collaboration_id: 7, agency_id: 3, agency: { id: 3, name: 'Dakar Immo' }, status: 'active' },
  { collaboration_id: 5, agency_id: 4, agency: { id: 4, name: 'Saly Gestion' }, status: 'paused' },
];

const reponse = vi.hoisted(() => ({ echec: false, profilDesAgences: 31, appels: [] as { path: string; headers?: Record<string, string> }[] }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async (path: string, options: { headers?: Record<string, string> } = {}) => {
    reponse.appels.push({ path, headers: options.headers });
    if (reponse.echec) throw new Error('réseau');
    if (path.includes('/intervention-d-origine')) return { data: INTERVENTION };
    if (path === '/api/me/pieces') return { data: PIECES };
    if (path === '/api/me/service-provider/agencies') return { data: AGENCES, meta: { total: 3, service_provider_profile_id: reponse.profilDesAgences } };
    if (path === '/api/me/profiles/31') return { data: REGLAGES };
    throw new Error(`inattendu : ${path}`);
  }),
}));

vi.mock('@/components/onboarding/ServiceProviderOnboardingWizard', () => ({ ServiceProviderOnboardingWizard: () => null }));

type PropsDeLAssistant = Record<string, unknown>;
type Coque = ReactElement<{ children: ReactElement<PropsDeLAssistant>; sortie?: string; largeur?: string; brouillon?: boolean }>;

async function rendu(params: Record<string, string> = {}): Promise<Coque> {
  const { default: Page } = await import('../page');
  return (await Page({ searchParams: Promise.resolve(params) })) as Coque;
}

describe('/onboarding/service-provider — ce que l’écran 2 de l’assistant montre (TCK-2613)', () => {
  beforeEach(() => {
    reponse.appels = [];
    reponse.echec = false;
    reponse.profilDesAgences = 31;
    profil.statut = 'draft';
    getSpAgenciesAction.mockReset();
  });

  it('l’invité tout neuf arrive ACTIF (l’acceptation l’a activé) : par `?sp=`, l’assistant, pas le panneau multi-agences', async () => {
    profil.statut = 'active';
    getSpAgenciesAction.mockResolvedValue({
      ok: true,
      data: { data: [AGENCES[1]], meta: { total: 1, service_provider_profile_id: 31 } },
    });
    const coque = await rendu({ sp: '31' });
    expect(coque.props.children.props).toMatchObject({ spProfileId: 31, agence: 'Dakar Immo', intervention: INTERVENTION });
    // La liste des agences déjà lue sert aussi l'écran : pas de seconde lecture.
    expect(reponse.appels.map((a) => a.path)).not.toContain('/api/me/service-provider/agencies');
  });

  it('déjà prestataire d’une autre agence, ou arrivé sans lien de reprise : le panneau multi-agences reste (TCK-262)', async () => {
    profil.statut = 'active';
    getSpAgenciesAction.mockResolvedValue({ ok: true, data: { data: AGENCES, meta: { total: 3, service_provider_profile_id: 31 } } });
    expect((await rendu({ sp: '31' })).props.children.props).toMatchObject({ spProfileId: 31, collaborations: AGENCES });

    getSpAgenciesAction.mockResolvedValue({ ok: true, data: { data: [AGENCES[1]], meta: { total: 1, service_provider_profile_id: 31 } } });
    expect((await rendu()).props.children.props).toMatchObject({ spProfileId: 31 });
    expect((await rendu()).props.children.props).not.toHaveProperty('intervention');
  });

  it('l’intervention, les réglages, les pièces de CE profil et l’agence de la collaboration la plus récente ; coque « Quitter », brouillon gardé', async () => {
    const coque = await rendu();
    expect(coque.props.children.props).toEqual({
      spProfileId: 31,
      agence: 'Dakar Immo',
      intervention: INTERVENTION,
      categorie: 'Plomberie',
      reglages: REGLAGES,
      pieces: PIECES,
    });
    expect(coque.props.sortie).toBe('quitter');
    expect(coque.props.largeur).toBe('assistant');
    expect(coque.props.brouillon).toBe(true);

    const chemins = reponse.appels.map((a) => a.path);
    // Les champs minimaux sont NOMMÉS (sparse fieldsets) : titre, catégorie, lieu, photo, devis.
    expect(chemins).toContain('/api/me/profiles/31/intervention-d-origine?fields[intervention_d_origine]=title,category,place,photo,quote');
    expect(reponse.appels.find((a) => a.path === '/api/me/pieces')?.headers).toEqual({ 'X-Profile-Id': 'service_provider:31' });
  });

  it('la liste des agences d’un AUTRE profil du compte ne prête pas son agence', async () => {
    reponse.profilDesAgences = 99;
    expect((await rendu()).props.children.props).toMatchObject({ agence: null });
  });

  it('toutes les lectures échouent : l’assistant s’ouvre quand même, sans rien montrer', async () => {
    reponse.echec = true;
    expect((await rendu()).props.children.props).toEqual({
      spProfileId: 31,
      agence: null,
      intervention: null,
      categorie: null,
      reglages: null,
      pieces: null,
    });
  });
});
