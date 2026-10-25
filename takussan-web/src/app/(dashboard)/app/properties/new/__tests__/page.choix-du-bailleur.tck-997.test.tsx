import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-997 (P15.06, P50.01, lot C) — la page décide à qui l'assistant offre le choix du bailleur :
 * au personnel d'une agence `standard` qui tient `properties.create` ET `properties.update_any`.
 * Sans `update_any`, le bien désigné n'est plus le sien, et les écritures qui suivent la création
 * (équipements, photos, contacts) lui seraient refusées. Jamais pour une proposition (un bailleur
 * ne désigne que lui-même) ni pour un indépendant (le titulaire y est le créateur).
 */
const mockGetMe = vi.fn();
const mockAgence = vi.fn();
const capacites = vi.hoisted(() => ({ valeur: [] as string[] }));

vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: async () => capacites.valeur }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => mockGetMe() }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  fetchListingQuotaAction: async () => ({ limit: null, used: 0, can_create: true }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...args: unknown[]) => mockAgence(...args),
}));
vi.mock('@/components/property-form/PropertyWizard', () => ({
  PropertyWizard: ({
    agenceDuChoixDuBailleur,
    peutInviterUnBailleur,
  }: {
    agenceDuChoixDuBailleur?: number | null;
    peutInviterUnBailleur?: boolean;
  }) => (
    <div
      data-testid="assistant"
      data-agence-du-choix={String(agenceDuChoixDuBailleur ?? 'aucune')}
      data-invitation={String(Boolean(peutInviterUnBailleur))}
    />
  ),
}));

import Page from '../page';

async function agenceDuChoix(): Promise<string | null> {
  render(withIntl(await Page()));
  return screen.getByTestId('assistant').getAttribute('data-agence-du-choix');
}

describe('/app/properties/new — à qui le choix du bailleur est offert (TCK-997)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agency_admin'], agency_id: 9 });
    mockAgence.mockResolvedValue({ id: 9, kind: 'standard' });
    capacites.valeur = ['properties.create', 'properties.update_any'];
  });

  it('le personnel d’une agence standard qui tient `properties.update_any` : l’agence 9', async () => {
    expect(await agenceDuChoix()).toBe('9');
  });

  it('l’agent sans `properties.update_any` : pas de choix', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agent'], agency_id: 9 });
    capacites.valeur = ['properties.create'];

    expect(await agenceDuChoix()).toBe('aucune');
  });

  it('un indépendant : pas de choix, le titulaire est le créateur', async () => {
    mockAgence.mockResolvedValue({ id: 9, kind: 'individual' });

    expect(await agenceDuChoix()).toBe('aucune');
  });

  it('une agence illisible : pas de choix (rien à affirmer)', async () => {
    mockAgence.mockResolvedValue(null);

    expect(await agenceDuChoix()).toBe('aucune');
  });

  it('un bailleur qui propose : pas de choix, il ne désigne que lui-même', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['owner'], agency_id: 9 });
    capacites.valeur = [];

    expect(await agenceDuChoix()).toBe('aucune');
  });

  // TCK-1000 (Q2) — « Inviter un nouveau bailleur » depuis le choix : la règle de `/app/owners`
  // (l'admin, ou `team.invite`), et seulement là où le choix est offert.
  it('TCK-1000 — l’admin peut inviter un bailleur depuis le choix', async () => {
    expect(await agenceDuChoix()).toBe('9');
    expect(screen.getByTestId('assistant')).toHaveAttribute('data-invitation', 'true');
  });

  it('TCK-1000 — l’agent qui tient `team.invite` aussi ; sans elle, le choix reste sans invitation', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agent'], agency_id: 9 });
    capacites.valeur = ['properties.create', 'properties.update_any', 'team.invite'];
    expect(await agenceDuChoix()).toBe('9');
    expect(screen.getByTestId('assistant')).toHaveAttribute('data-invitation', 'true');
  });

  it('TCK-1000 — l’agent sans `team.invite` ne voit pas l’invitation', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agent'], agency_id: 9 });
    expect(await agenceDuChoix()).toBe('9');
    expect(screen.getByTestId('assistant')).toHaveAttribute('data-invitation', 'false');
  });

  it('TCK-1000 — sans choix du bailleur, pas d’invitation non plus', async () => {
    mockAgence.mockResolvedValue({ id: 9, kind: 'individual' });
    expect(await agenceDuChoix()).toBe('aucune');
    expect(screen.getByTestId('assistant')).toHaveAttribute('data-invitation', 'false');
  });
});
