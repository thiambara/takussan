/**
 * TCK-2608 — l'orientation « professionnel » ouvre l'espace individuel puis arrive ici avec
 * `?raison_sociale=<le nom saisi>`. La page en préremplit la raison sociale de la demande,
 * SEULEMENT quand la fiche de l'agence n'en porte aucune : la fiche gagne toujours, et une valeur
 * vide ou démesurée (au-delà de 160 caractères) est ignorée.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { render } from '@testing-library/react';

import { withIntl } from '@/test/intl';

const mockAgence = vi.fn();
const propsDuFormulaire = vi.fn();

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ['agency_admin'], agency_id: 4 }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: async () => ['agency.update'] }));
vi.mock('@/components/admin-agency/fiche/CadreDeLaFiche', () => ({
  CadreDeLaFiche: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/lib/access/server-guards', () => ({ resolveAgencyOrNull: (...a: unknown[]) => mockAgence(...a) }));
vi.mock('@/lib/queries/agency-upgrade', () => ({ fetchAgencyUpgradeRequests: async () => ({ data: [] }) }));
vi.mock('@/lib/queries/offre', () => ({
  fetchOffreDePassage: async () => ({ code: 'pro', label: 'Offre Pro', monthly_price_xof: 65000, platform_fee_pct: 3, limits: {} }),
  fetchAbonnement: async () => null,
  fetchQuotaDeLAgence: async () => null,
}));
vi.mock('@/components/agency/UpgradeRequestForm', () => ({
  UpgradeRequestForm: (props: Record<string, unknown>) => {
    propsDuFormulaire(props);
    return <form aria-label="formulaire" />;
  },
}));
vi.mock('@/components/agency/UpgradeRequestStatus', () => ({ UpgradeRequestStatus: () => null }));

import Page from '../page';

const HOTE_SANS_RAISON = { id: 4, kind: 'individual', legal_name: null, rccm: null, ninea: null, legal_address: null };

async function raisonPreremplie(parametres: { raison_sociale?: string | string[] }): Promise<unknown> {
  render(withIntl(await Page({ searchParams: Promise.resolve(parametres) })));
  const props = propsDuFormulaire.mock.calls.at(-1)?.[0] as { prefill: { company_legal_name: unknown } };
  return props.prefill.company_legal_name;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAgence.mockResolvedValue(HOTE_SANS_RAISON);
});

describe('/app/settings/agency/upgrade — raison sociale proposée par l’orientation (TCK-2608)', () => {
  it('fiche sans raison sociale : le nom saisi à l’ouverture de l’espace, rogné, préremplit la demande', async () => {
    expect(await raisonPreremplie({ raison_sociale: '  Keur Immo  ' })).toBe('Keur Immo');
  });

  it('fiche avec raison sociale : la fiche gagne, la proposition est ignorée', async () => {
    mockAgence.mockResolvedValue({ ...HOTE_SANS_RAISON, legal_name: 'Studio de Aminata SARL' });
    expect(await raisonPreremplie({ raison_sociale: 'Keur Immo' })).toBe('Studio de Aminata SARL');
  });

  it('une proposition de plus de 160 caractères est ignorée ; 160 tout juste passe', async () => {
    expect(await raisonPreremplie({ raison_sociale: 'a'.repeat(161) })).toBeNull();
    expect(await raisonPreremplie({ raison_sociale: 'a'.repeat(160) })).toBe('a'.repeat(160));
  });

  it('vide, blanche, répétée ou absente : rien n’est proposé', async () => {
    expect(await raisonPreremplie({ raison_sociale: '   ' })).toBeNull();
    expect(await raisonPreremplie({ raison_sociale: ['Keur Immo', 'Autre'] })).toBeNull();
    expect(await raisonPreremplie({})).toBeNull();
  });
});
