/**
 * TCK-2908 — `/app/properties` relaie ce que la liste et la jauge affichent :
 *  · AC1 — `?owner_profile_id=40` part en `filter[owner_profile_id]=40` (filtre serveur, jamais sur la page
 *    reçue) ; une valeur non numérique n'est pas relayée ; les bailleurs de l'agence vont au panneau du mode
 *    Gestion, et seulement au personnel ;
 *  · AC2 — le mode Annonces demande `stats30d` ;
 *  · AC3 — le nom de l'offre (`plan.label`) va à la jauge, sur les deux présentations ; un refus de
 *    l'abonnement (403 `agency.staff_only`) n'affiche rien et ne casse rien.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type React from 'react';

import { withIntl } from '@/test/intl';

const apiRequest = vi.fn();
const utilisateur = vi.hoisted(() => ({ roles: ['agency_admin'] as string[], agency_id: 3 as number | null }));
const recus = vi.hoisted(() => ({ filtres: [] as Record<string, unknown>[], jauges: [] as Record<string, unknown>[] }));
const lectures = vi.hoisted(() => ({
  abonnement: vi.fn(),
  bailleurs: vi.fn(),
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 7, first_name: 'Awa', last_name: 'Diop', roles: utilisateur.roles, agency_id: utilisateur.agency_id, phone_verified_at: null }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/biens/mode-memorise', () => ({ modeMemoriseDesBiens: async () => undefined }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));
vi.mock('@/lib/queries/offre', () => ({ fetchAbonnement: (...a: unknown[]) => lectures.abonnement(...a) }));
vi.mock('@/lib/biens/bailleurs-du-filtre', () => ({ fetchBailleursDuFiltre: (...a: unknown[]) => lectures.bailleurs(...a) }));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({
  PropertyListFilters: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    recus.filtres.push(props);
    return <>{props.children}</>;
  },
}));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/property-dashboard/ModesDeLaListe', () => ({
  SelecteurDeMode: () => null,
  PastillesGestion: () => null,
  TuilesGestion: () => null,
  PastillesAnnonces: () => null,
  OngletsAnnonces: () => null,
  JaugeDuQuota: (props: Record<string, unknown>) => {
    recus.jauges.push(props);
    return null;
  },
  AfficherLesSuivants: () => null,
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  fetchListingQuotaAction: async () => ({ used: 67, limit: 100, can_create: true }),
}));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));

import Page from '../page';

const RESUME = { total: 84, occupied: 61, vacant: 9, for_sale: 0, notice: 3, rent_late: 6, online: 67, pending_validation: 1, drafts: 4, offline: 12, sold_or_rented: 23, archived: 8 };
const BAILLEURS = [{ id: 40, name: 'Mouhamed Sène' }];

const listes = () =>
  apiRequest.mock.calls.map(([c]) => decodeURIComponent(String(c))).filter((u) => u.startsWith('/api/properties?'));

beforeEach(() => {
  utilisateur.roles = ['agency_admin'];
  utilisateur.agency_id = 3;
  recus.filtres = [];
  recus.jauges = [];
  lectures.abonnement.mockReset().mockResolvedValue({ id: 1, plan: { label: 'Pro' } });
  lectures.bailleurs.mockReset().mockResolvedValue(BAILLEURS);
  apiRequest.mockReset().mockImplementation(async (chemin: string) => {
    const u = decodeURIComponent(chemin);
    if (u.startsWith('/api/properties/portfolio-summary')) return { data: RESUME };
    return { data: [{ id: 1, title: 'Villa' }], meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 } };
  });
});

const rendre = async (searchParams: Record<string, string>) => render(withIntl(await Page({ searchParams: Promise.resolve(searchParams) })));

describe('TCK-2908 (AC1) — « Tous les bailleurs »', () => {
  it('`owner_profile_id` part en `filter[owner_profile_id]` côté serveur', async () => {
    await rendre({ mode: 'gestion', owner_profile_id: '40' });
    expect(listes()).toHaveLength(1);
    expect(listes()[0]).toContain('filter[owner_profile_id]=40');
  });

  it('une valeur non numérique n’est pas relayée', async () => {
    await rendre({ mode: 'gestion', owner_profile_id: '40 OR 1=1' });
    expect(listes()[0]).not.toContain('owner_profile_id');
  });

  it('les bailleurs de l’agence vont au panneau du mode Gestion', async () => {
    await rendre({ mode: 'gestion' });
    expect(lectures.bailleurs).toHaveBeenCalledWith('jeton', 3);
    expect(recus.filtres.at(-1)?.bailleurOptions).toEqual(BAILLEURS);
  });

  it('une lecture refusée du carnet : pas de liste, la page se rend', async () => {
    lectures.bailleurs.mockRejectedValue(new Error('403'));
    await rendre({ mode: 'gestion' });
    expect(recus.filtres.at(-1)?.bailleurOptions).toBeUndefined();
  });

  it('le bailleur (hors personnel) ne lit ni le carnet ni l’abonnement', async () => {
    utilisateur.roles = ['owner'];
    await rendre({ mode: 'gestion' });
    expect(lectures.bailleurs).not.toHaveBeenCalled();
    expect(lectures.abonnement).not.toHaveBeenCalled();
  });
});

describe('TCK-2908 (AC2, AC3) — le mode Annonces', () => {
  it('le filtre de bailleur vaut aussi en Annonces, et sa puce reçoit les noms', async () => {
    await rendre({ mode: 'annonces', owner_profile_id: '40' });
    expect(listes()[0]).toContain('filter[owner_profile_id]=40');
    expect(recus.filtres.at(-1)?.bailleurOptions).toEqual(BAILLEURS);
  });

  it('demande `stats30d`, et passe « Pro » aux deux jauges', async () => {
    await rendre({ mode: 'annonces' });
    expect(listes()[0]).toContain('include=address,owner,collaborators,online,offlineReasons,stats30d');
    expect(recus.jauges.map((j) => [j.presentation, j.offre])).toEqual([
      ['bureau', 'Pro'],
      ['telephone', 'Pro'],
    ]);
  });

  it('un abonnement refusé (403) : la jauge reste, sans nom d’offre', async () => {
    lectures.abonnement.mockRejectedValue(new Error('agency.staff_only'));
    await rendre({ mode: 'annonces' });
    expect(recus.jauges.map((j) => j.offre)).toEqual([null, null]);
  });
});
