/**
 * TCK-2651 (ADR-0100 § 2 et § 5) — `/app/payments` rend « Loyers » à la persona `bailleur`, et à elle
 * seule : la persona du PROFIL ACTIF lié (`resoudrePersona`), jamais l'union des rôles. Un agent qui est
 * aussi bailleur, sous son profil d'agent, garde ses onglets ; l'hôte garde l'écran d'aujourd'hui.
 *
 * Le profil actif est celui que `/api/auth/me` a résolu (`active_profile_id`) : la page ne lit pas le
 * cookie elle-même, ce qui lui ferait perdre son exemption de repli (`etats-de-route.test.ts`).
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const getMeAction = vi.fn();
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMeAction() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton', getActiveProfileId: async () => { throw new Error('la page ne lit pas le cookie du profil (TCK-2677)'); } }));
vi.mock('@/lib/access/server-guards', () => ({
  ROUTE_VERIF_INDISPONIBLE: '/verification-indisponible',
  resolveAgencyOrNull: async () => ({ id: 7, kind: 'individual' }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/components/payments/PaymentsTabs', () => ({ PaymentsTabs: () => <div data-testid="ecran-paiements" /> }));
vi.mock('@/components/payments/CustomerPayments', () => ({ CustomerPayments: () => <div data-testid="vue-client" /> }));
vi.mock('@/components/payments/bailleur/LoyersDuBailleur', () => ({ LoyersDuBailleur: () => <div data-testid="loyers-du-bailleur" /> }));

import Page, { generateMetadata } from '../page';

async function ouvrir(user: object) {
  getMeAction.mockResolvedValue(user);
  render(withIntl(await Page({ searchParams: Promise.resolve({}) })));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TCK-2651 — « Loyers » pour la persona bailleur', () => {
  it('le bailleur (profil actif owner) reçoit « Loyers », et l’onglet du navigateur le dit', async () => {
    await ouvrir({ id: 3, roles: ['owner', 'customer'], agency_id: 7, active_profile_id: 'owner:3' });
    expect(screen.getByTestId('loyers-du-bailleur')).toBeInTheDocument();
    expect(screen.queryByTestId('ecran-paiements')).toBeNull();
    // Le titre est déclaré par la page elle-même (son PageHeader) : pas de second en-tête autour.
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect((await generateMetadata()).title).toBe('Loyers');
  });

  it('sans profil lisible, le bailleur seul retombe sur « Loyers » (l’auto-bascule de l’API)', async () => {
    await ouvrir({ id: 3, roles: ['owner', 'customer'], agency_id: 7 });
    expect(screen.getByTestId('loyers-du-bailleur')).toBeInTheDocument();
  });

  it('le même agent-bailleur, sous son profil propriétaire, reçoit « Loyers »', async () => {
    await ouvrir({ id: 4, roles: ['agent', 'owner', 'customer'], agency_id: 7, active_profile_id: 'owner:4' });
    expect(screen.getByTestId('loyers-du-bailleur')).toBeInTheDocument();
  });

  it('l’agent aussi bailleur, sous son profil d’agent, garde ses onglets', async () => {
    await ouvrir({ id: 4, roles: ['agent', 'owner', 'customer'], agency_id: 7, active_profile_id: 'agent:4' });
    expect(screen.getByTestId('ecran-paiements')).toBeInTheDocument();
    expect(screen.queryByTestId('loyers-du-bailleur')).toBeNull();
    expect((await generateMetadata()).title).toBe('Paiements');
  });

  it('l’hôte (agence individual, admin et bailleur) garde l’écran d’aujourd’hui (ADR-0100 § 5)', async () => {
    await ouvrir({ id: 9, roles: ['agency_admin', 'owner', 'customer'], agency_id: 7, active_profile_id: 'owner:9' });
    expect(screen.getByTestId('ecran-paiements')).toBeInTheDocument();
    expect(screen.queryByTestId('loyers-du-bailleur')).toBeNull();
  });

  it('le locataire garde sa page', async () => {
    await ouvrir({ id: 5, roles: ['tenant', 'customer'], agency_id: null });
    expect(screen.getByTestId('vue-client')).toBeInTheDocument();
  });
});
