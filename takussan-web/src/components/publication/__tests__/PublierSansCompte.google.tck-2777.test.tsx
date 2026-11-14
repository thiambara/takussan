/**
 * TCK-2777 — ce que `/publish` remet à l'assistant pour l'aller-retour Google : la reprise lue dans
 * l'URL de retour (`?reprise=`), oubliée une fois faite, et « durable » seulement si l'annonce est
 * gardée dans ce navigateur (en mémoire, elle ne survivrait pas à la navigation).
 *
 * Harnais de `PublierSansCompte.espace.tck-2601.test.tsx` : l'assistant est doublé, on éprouve ce qu'il reçoit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { ModeAnonyme } from '@/components/property-form/PropertyWizard';
import { moteurEnMemoire, ouvrirBrouillonLocal, type MoteurDeStockage } from '@/lib/publication/brouillon-local';

const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur, usePathname: () => '/publish', useSearchParams: () => new URLSearchParams() }));

const doublures = vi.hoisted(() => ({ anonyme: null as ModeAnonyme | null }));
vi.mock('@/components/property-form/PropertyWizard', () => ({
  AssistantDePublication: ({ anonyme }: { anonyme: ModeAnonyme }) => {
    doublures.anonyme = anonyme;
    return <div>assistant</div>;
  },
}));
vi.mock('@/app/actions/auto-onboard', () => ({ autoOnboardAction: vi.fn() }));
vi.mock('@/hooks/useProfiles', () => ({
  profilesKeys: { all: ['profiles', 'me'] },
  fetchProfilesViaProxy: vi.fn(),
  useSwitchActiveProfile: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ refreshUser: vi.fn(), user: null }) }));
vi.mock('@/components/auth/useConnexionParTelephone', () => ({ useConnexionParTelephone: () => true }));
vi.mock('@/lib/queries/referentiel-public', () => ({ useEquipementsApprouves: () => ({ data: { data: [] } }) }));
vi.mock('@/components/entree/CoqueDEntree', () => ({ DeclarerEntree: () => null }));

import { PublierSansCompte } from '../PublierSansCompte';

const adresseOriginale = `${window.location.pathname}${window.location.search}`;

beforeEach(() => {
  vi.clearAllMocks();
  doublures.anonyme = null;
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', adresseOriginale);
});

async function monter(moteur: MoteurDeStockage | null = moteurEnMemoire()) {
  render(
    withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <PublierSansCompte surPublier={vi.fn()} brouillonLocal={() => ouvrirBrouillonLocal({ moteur })} />
      </QueryClientProvider>,
    ),
  );
  await waitFor(() => expect(doublures.anonyme).not.toBeNull());
  return doublures.anonyme!;
}

describe('TCK-2777 — la reprise Google que /publish remet à l’assistant', () => {
  it('?reprise=echec : remise à l’assistant, puis oubliée de l’URL (les autres paramètres restent)', async () => {
    window.history.replaceState(null, '', '/publish?x=1&reprise=echec');
    const anonyme = await monter();
    expect(anonyme.google).toEqual({ durable: true, reprise: 'echec', surRepriseLue: expect.any(Function) });
    anonyme.google!.surRepriseLue();
    expect(`${window.location.pathname}${window.location.search}`).toBe('/publish?x=1');
  });

  it('?reprise=compte : remise telle quelle', async () => {
    window.history.replaceState(null, '', '/publish?reprise=compte');
    expect((await monter()).google?.reprise).toBe('compte');
  });

  it('une valeur inconnue, ou aucune : pas de reprise', async () => {
    window.history.replaceState(null, '', '/publish?reprise=ailleurs');
    expect((await monter()).google?.reprise).toBeNull();
  });

  it('annonce gardée en mémoire seulement (stockage refusé) : pas durable, donc pas de Google', async () => {
    const anonyme = await monter(null);
    await waitFor(() => expect(doublures.anonyme!.google?.durable).toBe(false));
    void anonyme;
  });
});
