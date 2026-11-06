/**
 * TCK-371 (revue adverse) — anneau de focus de la BARRE HAUTE, montée sur chaque page de `/app`
 * (section d'agence `/app/agency` comprise, TCK-649).
 *
 * `AppShell` rend `AppTopbar` au-dessus de la console, sur un `bg-foreground`. Ses deux contrôles écrits à la main — le hamburger, alors SEUL moyen d'ouvrir le tiroir de
 * navigation sous `md`, et le lien du logo — ne portaient AUCUN `focus-visible` : ils retombaient
 * sur la règle globale `* { outline-ring/50 }` de `globals.css`, mesurée à **1,73:1** sur ce fond,
 * là où WCAG 1.4.11 exige 3:1.
 *
 * TCK-2481 — le hamburger a quitté la barre haute : sous `md`, « Menu » de la barre d'onglets
 * (`BarreDOnglets`) ouvre le tiroir. Il ne reste ici que le logo, et ce fichier garde aussi que le
 * burger ne revient pas (AC3).
 *
 * TCK-2482 — le bouton de la palette de commandes est le second contrôle écrit à la main : même
 * mesure, sur ses deux fonds — le jeton `--background` (#fcf9f3) à 10 % et 20 % (survol), composé
 * sur la barre (#1f1812).
 *
 * Ce fichier n'existait pas : c'est aussi ce qui a permis à l'oubli de tenir. Comme pour la barre
 * latérale, il MESURE (`@/test/contraste-wcag`) au lieu de figer une chaîne de classes — alpha
 * composé avant le calcul, sur le fond réel remonté du DOM, dans chaque état que l'élément peut
 * prendre (`hover:bg-white/10` compris).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import {
  SEUIL_NON_TEXTUEL,
  anneauDeFocus,
  composer,
  contraste,
  fmt,
  fondsPossibles,
  resoudreCouleur,
  versRvb,
} from '@/test/contraste-wcag';
import type { User } from '@/types/user';
import { ToastProvider } from '@/components/ui/toast';
import { AppTopbar } from '../AppTopbar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/agency',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: null, user: null, logout: vi.fn() }),
}));

const UTILISATEUR = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  roles: ['agency_admin'],
  avatar_url: null,
} as unknown as User;

const PALETTE = 'Aller à une page ou changer d’espace';

function rendreBarreHaute({ avecPalette = true }: { avecPalette?: boolean } = {}) {
  const onOuvrirPalette = avecPalette ? vi.fn() : undefined;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        {/* `ProfileSwitcher` appelle `useToast`, qui exige le provider de base-ui. */}
        <ToastProvider>
          <AppTopbar user={UTILISATEUR} onOuvrirPalette={onOuvrirPalette} />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

afterEach(() => cleanup());

describe('AppTopbar — le contrôle écrit à la main porte un anneau MESURÉ', () => {
  /** Le `<header>` porte `bg-foreground` : c'est le fond de tous les éléments qui n'en ont pas. */
  it('la barre haute est bien posée sur le fond sombre — sans quoi la mesure ne dit rien', () => {
    const { container } = rendreBarreHaute();
    const entete = container.querySelector('header')!;
    expect(entete.className).toMatch(/\bbg-foreground\b/);
    expect(resoudreCouleur('foreground')).toBe('#1f1812');
  });

  it.each([
    ['logo', () => screen.getByRole('link', { name: 'Takussan' })],
    ['bouton de la palette', () => screen.getByRole('button', { name: PALETTE })],
  ])('%s : anneau plein, ≥ 3:1 sur tous ses fonds', (nom, trouver) => {
    rendreBarreHaute();
    const element = trouver();

    const anneau = anneauDeFocus(element);
    expect(anneau, `le ${nom} ne déclare aucun \`focus-visible:outline-<couleur>\``).not.toBeNull();
    // `outline-2` rend `outline-style: solid` — sans lui, `outline: auto` du navigateur garde la
    // main et `outline-color` n'est jamais appliqué.
    expect(element.className).toMatch(/focus-visible:outline-2\b/);
    // La règle globale, c'est `outline-ring/50` : 1,73:1 ici. Le jeton doit être PLEIN.
    expect(anneau!.alpha).toBe(1);

    for (const fond of fondsPossibles(element)) {
      const ratio = contraste(
        composer(versRvb(anneau!.hex), versRvb(fond.hex), anneau!.alpha),
        fond.hex,
      );
      expect(
        ratio,
        `${nom} — ${anneau!.classe} sur ${fond.hex} (${fond.etat}, ${fond.provenance}) `
        + `= ${fmt(ratio)}`,
      ).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
    }
  });

  it('le décalage est SORTANT : le `<header>` ne coupe sur aucun axe', () => {
    const { container } = rendreBarreHaute();
    const entete = container.querySelector('header')!;
    // Contrairement au `<nav>` de la barre latérale (`overflow-y-auto`), rien ici ne rogne — et
    // le logo est un lien EN LIGNE sans padding vertical, qu'un anneau rentrant traverserait.
    expect(entete.className).not.toMatch(/\boverflow-/);

    const logo = screen.getByRole('link', { name: 'Takussan' });
    expect(anneauDeFocus(logo)!.rentrant).toBe(false);
    expect(logo.className).toMatch(/focus-visible:outline-offset-2\b/);
  });

  it('TCK-2482 — le bouton de la palette : les trois classes de l’anneau, décalage sortant', () => {
    rendreBarreHaute();
    const bouton = screen.getByRole('button', { name: PALETTE });
    const classes = bouton.className.split(/\s+/);
    expect(classes).toContain('focus-visible:outline-2');
    expect(classes).toContain('focus-visible:outline-offset-2');
    expect(classes).toContain('focus-visible:outline-white');
    expect(anneauDeFocus(bouton)!.rentrant).toBe(false);
  });

  it('TCK-2482 — ses deux fonds : `--background` composé sur la barre, l’anneau blanc à ≥ 3:1 sur chacun', () => {
    rendreBarreHaute();
    const bouton = screen.getByRole('button', { name: PALETTE });
    expect(resoudreCouleur('background')).toBe('#fcf9f3');
    const fonds = fondsPossibles(bouton);
    expect(fonds.map((f) => f.provenance)).toEqual([
      'bg-background/10 sur #1f1812',
      'hover:bg-background/20 sur #1f1812',
    ]);
    const anneau = anneauDeFocus(bouton)!;
    for (const fond of fonds) {
      const ratio = contraste(composer(versRvb(anneau.hex), versRvb(fond.hex), anneau.alpha), fond.hex);
      expect(ratio, `${anneau.classe} sur ${fond.hex} (${fond.provenance}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
    }
  });

  it('TCK-2482 — sans `onOuvrirPalette` (plein écran), aucun bouton de palette', () => {
    rendreBarreHaute({ avecPalette: false });
    expect(screen.queryByRole('button', { name: PALETTE })).toBeNull();
  });

  it('TCK-2481 — AC3 : plus de burger dans la barre haute', () => {
    rendreBarreHaute();
    expect(screen.queryByRole('button', { name: 'Ouvrir le menu' })).toBeNull();
  });
});
