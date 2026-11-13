/**
 * TCK-2600 (fidélité) — ce que `/publish` donne au cadre d'entrée de l'assistant (maquette
 * `app-entree-publier`, a-0 à a-5) :
 *
 * - la note du pied, sous l'aperçu, propre à chaque étape (« Brouillon gardé … » au prix, la mention
 *   des conditions à la finition, ses deux liens) ;
 * - « Effacer ce brouillon » : dès 1280 px dans la barre, après « Brouillon gardé dans ce
 *   navigateur » ; en deçà dans la ligne d'état. Jamais les deux à la fois, et inerte sous le verrou
 *   du compte (TCK-2601, AC5) où qu'il soit.
 *
 * L'assistant et la coque sont doublés (patron de `PublierSansCompte.verrou.tck-2601.test.tsx`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

const matchMediaOriginal = window.matchMedia;
const fetchOriginal = globalThis.fetch;

/** `(width >= 80rem)` répond `large` ; toute autre requête, non. */
function largeur(large: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: large && query === '(width >= 80rem)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  doublures.anonyme = null;
  doublures.brouillon = null;
  doublures.declaration = null;
  globalThis.fetch = vi.fn(async () => new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = fetchOriginal;
  window.matchMedia = matchMediaOriginal;
});

async function monter() {
  render(
    withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <PublierSansCompte surPublier={vi.fn()} brouillonLocal={() => ouvrirBrouillonLocal({ moteur: moteurEnMemoire() })} />
      </QueryClientProvider>,
    ),
  );
  await waitFor(() => expect(doublures.anonyme).not.toBeNull());
}

/**
 * La note de barre telle que la coque la rendrait, dans un conteneur DÉTACHÉ du document : les requêtes
 * de `screen` ne voient que le corps de la page.
 */
function barre() {
  return within(render(withIntl(<>{doublures.declaration?.noteDeBarre}</>), { container: document.createElement('div') }).container);
}

describe('TCK-2600 — la note du pied, sous l’aperçu', () => {
  it('une note par étape ; « Brouillon gardé … » au prix ; la mention des conditions, avec ses deux liens, à la finition', async () => {
    await monter();
    const note = (etape: string) => render(withIntl(<>{doublures.anonyme!.noteDuPied!(etape)}</>)).container;

    expect(note('bien')).toHaveTextContent('Aucun compte à créer pour commencer : votre numéro est demandé à la fin, au moment de publier.');
    expect(note('lieu')).toHaveTextContent('La ville suffit pour continuer');
    expect(note('caracteristiques')).toHaveTextContent('Seule la surface compte vraiment');
    expect(note('prix')).toHaveTextContent('Brouillon gardé dans ce navigateur — il passera dans votre compte au moment de publier.');
    expect(note('photos')).toHaveTextContent('Étape facultative : « Plus tard » passe au titre');

    // Maquette a-5 : la phrase des conditions en 12 px à 1,625 (`PhraseCGU`), pas en 13 px serré.
    expect(note('finition').firstElementChild).toHaveClass('block', 'text-xs', 'leading-relaxed');
    const finition = within(note('finition'));
    expect(finition.getByRole('link', { name: 'conditions générales' })).toHaveAttribute('href', expect.stringContaining('/legal/terms'));
    expect(finition.getByRole('link', { name: 'politique de confidentialité' })).toHaveAttribute('href', expect.stringContaining('/legal/privacy'));

    expect(note('inconnue')).toBeEmptyDOMElement();
  });
});

describe('TCK-2600 — « Effacer ce brouillon » : la barre dès 1280, la ligne d’état en deçà', () => {
  it('sous 1280 : dans la ligne d’état, pas dans la barre', async () => {
    largeur(false);
    await monter();
    act(() => doublures.brouillon!.save(2, { title: 'Studio à Dakar' }));

    expect(await screen.findByRole('button', { name: 'Effacer ce brouillon' })).toBeInTheDocument();
    expect(barre().queryByRole('button', { name: 'Effacer ce brouillon' })).toBeNull();
  });

  it('dès 1280 : dans la barre, après « Brouillon gardé dans ce navigateur », un seul ; inerte sous le verrou du compte', async () => {
    largeur(true);
    await monter();
    act(() => doublures.brouillon!.save(2, { title: 'Studio à Dakar' }));

    await waitFor(() => expect(barre().getByRole('button', { name: 'Effacer ce brouillon' })).toBeEnabled());
    const dansLaBarre = barre();
    // Détaché du document : la présence se lit au contenu, pas par `toBeInTheDocument`.
    expect(dansLaBarre.getByText('Brouillon gardé dans ce navigateur').parentElement?.textContent).toBe('Brouillon gardé dans ce navigateur·Effacer ce brouillon');
    // Le corps de la page n'en rend pas un second.
    expect(screen.queryByRole('button', { name: 'Effacer ce brouillon' })).not.toBeInTheDocument();

    act(() => doublures.anonyme!.surVerrou?.(true));
    expect(barre().getByRole('button', { name: 'Effacer ce brouillon' })).toBeDisabled();
  });

  it('dès 1280, sans contenu : la barre ne propose rien à effacer', async () => {
    largeur(true);
    await monter();
    await waitFor(() => expect(doublures.declaration?.noteDeBarre).toBeTruthy());
    expect(barre().queryByRole('button', { name: 'Effacer ce brouillon' })).toBeNull();
  });
});
