/**
 * TCK-616 (AC4) — « Changer l'agent responsable » de la liste des biens propose le PERSONNEL ACTIF de
 * l'agence, lu au serveur (`/api/agencies/{agency}/members?filter[assignable]=1`, sparse fieldset) :
 * un agent sans aucun bien sur la page y figure, un bailleur jamais. Le filtre d'agent, lui, garde ses
 * choix tirés de la page (`filter[user_id]` vise aussi un titulaire bailleur).
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type React from 'react';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';

type Option = { id: number; name: string };

const apiRequest = vi.fn();
const utilisateur = vi.hoisted(() => ({ roles: ['agency_admin'] as string[], agency_id: 3 as number | null }));
const recus = vi.hoisted(() => ({ listes: [] as Record<string, unknown>[], filtres: [] as Record<string, unknown>[] }));

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
vi.mock('@/lib/queries/offre', () => ({ fetchAbonnement: async () => null }));
vi.mock('@/lib/biens/bailleurs-du-filtre', () => ({ fetchBailleursDuFiltre: async () => [] }));
vi.mock('@/components/property-dashboard/PropertyList', () => ({
  PropertyList: (props: Record<string, unknown>) => {
    recus.listes.push(props);
    return null;
  },
}));
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
  JaugeDuQuota: () => null,
  AfficherLesSuivants: () => null,
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  fetchListingQuotaAction: async () => ({ used: 1, limit: 100, can_create: true }),
}));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));

import Page from '../page';

const RESUME = { total: 1, occupied: 1, vacant: 0, for_sale: 0, notice: 0, rent_late: 0, online: 1, pending_validation: 0, drafts: 0, offline: 0, sold_or_rented: 0, archived: 0 };
/** Le seul bien de la page : son bailleur (50) et un collaborateur (60). */
const BIEN = {
  id: 1,
  title: 'Villa',
  owner: { id: 50, name: 'Mouhamed Sène (bailleur)' },
  collaborators: [{ user: { id: 60, name: 'Fatou Ba' } }],
};
/** Le personnel actif : l'admin (7), un agent sans aucun bien sur la page (21). */
const PERSONNEL = [
  { id: 7, first_name: 'Awa', last_name: 'Diop' },
  { id: 21, first_name: 'Ousmane', last_name: 'Fall' },
];

let membres: () => Promise<unknown>;

const appels = () => apiRequest.mock.calls.map(([c]) => decodeURIComponent(String(c)));

beforeEach(() => {
  utilisateur.roles = ['agency_admin'];
  utilisateur.agency_id = 3;
  recus.listes = [];
  recus.filtres = [];
  membres = async () => ({ data: PERSONNEL, meta: { current_page: 1, last_page: 1, per_page: 100, total: 2 } });
  apiRequest.mockReset().mockImplementation(async (chemin: string) => {
    const u = decodeURIComponent(chemin);
    if (u.startsWith('/api/properties/portfolio-summary')) return { data: RESUME };
    if (u.startsWith('/api/agencies/3/members')) return membres();
    return { data: [BIEN], meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 } };
  });
});

const rendre = async (searchParams: Record<string, string> = {}) =>
  render(withIntl(await Page({ searchParams: Promise.resolve(searchParams) })));
const choixDuLot = () => (recus.listes.at(-1)!.agentOptions as Option[]).map((o) => o.id);

describe('TCK-616 (AC4) — le sélecteur du lot', () => {
  it.each(['gestion', 'annonces'])('propose le personnel actif, jamais un bailleur (mode %s)', async (mode) => {
    await rendre({ mode });

    expect(choixDuLot()).toContain(21);
    expect(choixDuLot()).toContain(7);
    expect(choixDuLot()).not.toContain(50);
    expect(choixDuLot()).not.toContain(60);
  });

  it('lit le personnel joignable au serveur, en sparse fieldset', async () => {
    await rendre();

    const lecture = appels().find((u) => u.startsWith('/api/agencies/3/members'));
    expect(lecture).toContain('filter[assignable]=1');
    expect(lecture).toContain('fields[users]=id,first_name,last_name');
  });

  it('le filtre d’agent garde ses choix de la page', async () => {
    await rendre();

    const filtre = (recus.filtres.at(-1)!.agentOptions as Option[]).map((o) => o.id);
    expect(filtre).toEqual(expect.arrayContaining([7, 50, 60]));
  });

  it('un refus de la liste (agent sans `crm.assign`) ne laisse que « moi »', async () => {
    utilisateur.roles = ['agent'];
    membres = async () => {
      throw new ApiError(403, { message: 'Forbidden' });
    };

    await rendre();

    expect(recus.listes.at(-1)!.agentOptions).toEqual([{ id: 7, name: 'Awa Diop' }]);
  });

  it('un bailleur seul ne reçoit aucun choix (sa porte est la fiche, TCK-504)', async () => {
    utilisateur.roles = ['owner'];

    await rendre();

    expect(recus.listes.at(-1)!.agentOptions).toEqual([]);
    expect(appels().some((u) => u.includes('/members'))).toBe(false);
  });

  it('sans agence (super-admin), aucun choix', async () => {
    utilisateur.roles = ['super_admin', 'agent'];
    utilisateur.agency_id = null;

    await rendre();

    expect(recus.listes.at(-1)!.agentOptions).toEqual([]);
    expect(appels().some((u) => u.includes('/members'))).toBe(false);
  });
});
