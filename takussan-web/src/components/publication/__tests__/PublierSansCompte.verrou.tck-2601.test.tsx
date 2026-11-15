/**
 * TCK-2601 (AC5) — au bureau, le panneau de compte n'a plus de voile : « Effacer ce brouillon »,
 * « Quitter » et la marque restent à côté de lui. Tant que l'assistant dit la feuille ouverte ou ses
 * écritures en cours (`surVerrou`), la page les rend inertes ; refermée, ils reviennent.
 *
 * L'assistant et la coque sont doublés : on éprouve ce que la page fait du verrou, pas ses sources
 * (éprouvées dans `PropertyWizard.panneau.tck-2601.test.tsx` et `CoqueDEntree.sortie-bloquee`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { ModeAnonyme } from '@/components/property-form/PropertyWizard';
import type { DeclarationDEntree } from '@/components/entree/CoqueDEntree';
import { moteurEnMemoire, ouvrirBrouillonLocal } from '@/lib/publication/brouillon-local';

const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur, usePathname: () => '/publish', useSearchParams: () => new URLSearchParams() }));

const doublures = vi.hoisted(() => ({
  anonyme: null as ModeAnonyme | null,
  brouillon: null as { save: (etape: number, donnees: Record<string, unknown>) => void } | null,
  declaration: null as DeclarationDEntree | null,
}));

vi.mock('@/components/property-form/PropertyWizard', () => ({
  AssistantDePublication: ({ anonyme, brouillon }: { anonyme: ModeAnonyme; brouillon: typeof doublures.brouillon }) => {
    doublures.anonyme = anonyme;
    doublures.brouillon = brouillon;
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
vi.mock('@/components/entree/CoqueDEntree', () => ({
  DeclarerEntree: (declaration: DeclarationDEntree) => {
    doublures.declaration = declaration;
    return null;
  },
}));

import { PublierSansCompte } from '../PublierSansCompte';

const fetchOriginal = globalThis.fetch;
beforeEach(() => {
  doublures.anonyme = null;
  doublures.brouillon = null;
  doublures.declaration = null;
  globalThis.fetch = vi.fn(async () => new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = fetchOriginal;
});

describe('TCK-2601 (AC5) — les sorties de /publish attendent la fin du compte', () => {
  it('feuille ouverte ou écritures : « Effacer ce brouillon » désactivé et la sortie de la coque bloquée ; refermée, tout revient', async () => {
    render(
      withIntl(
        <QueryClientProvider client={new QueryClient()}>
          <PublierSansCompte surPublier={vi.fn()} brouillonLocal={() => ouvrirBrouillonLocal({ moteur: moteurEnMemoire() })} />
        </QueryClientProvider>,
      ),
    );
    await waitFor(() => expect(doublures.anonyme).not.toBeNull());
    act(() => doublures.brouillon!.save(2, { title: 'Studio à Dakar' }));
    const effacer = await screen.findByRole('button', { name: 'Effacer ce brouillon' });
    expect(effacer).toBeEnabled();
    expect(doublures.declaration?.sortieBloquee).toBe(false);

    act(() => doublures.anonyme!.surVerrou?.(true));
    expect(effacer).toBeDisabled();
    expect(doublures.declaration?.sortieBloquee).toBe(true);

    act(() => doublures.anonyme!.surVerrou?.(false));
    expect(effacer).toBeEnabled();
    expect(doublures.declaration?.sortieBloquee).toBe(false);
  });
});
