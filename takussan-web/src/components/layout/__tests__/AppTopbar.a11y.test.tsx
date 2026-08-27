/**
 * TCK-371 (revue adverse) — anneau de focus de la BARRE HAUTE, montée sur chaque page `/admin`.
 *
 * `AdminShell` rend `AppTopbar` au-dessus de la console, sur le même `bg-foreground` que la barre
 * latérale. Ses deux contrôles écrits à la main — le hamburger, SEUL moyen d'ouvrir le tiroir de
 * navigation sous `md`, et le lien du logo — ne portaient AUCUN `focus-visible` : ils retombaient
 * sur la règle globale `* { outline-ring/50 }` de `globals.css`, mesurée à **1,73:1** sur ce fond,
 * là où WCAG 1.4.11 exige 3:1.
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
  usePathname: () => '/admin',
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

function rendreBarreHaute() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        {/* `ProfileSwitcher` appelle `useToast`, qui exige le provider de base-ui. */}
        <ToastProvider>
          <AppTopbar user={UTILISATEUR} onMenuToggle={vi.fn()} />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

afterEach(() => cleanup());

describe('AppTopbar — les deux contrôles écrits à la main portent un anneau MESURÉ', () => {
  /** Le `<header>` porte `bg-foreground` : c'est le fond de tous les éléments qui n'en ont pas. */
  it('la barre haute est bien posée sur le fond sombre — sans quoi la mesure ne dit rien', () => {
    const { container } = rendreBarreHaute();
    const entete = container.querySelector('header')!;
    expect(entete.className).toMatch(/\bbg-foreground\b/);
    expect(resoudreCouleur('foreground')).toBe('#1f1812');
  });

  it.each([
    ['hamburger', () => screen.getByRole('button', { name: 'Ouvrir le menu' })],
    ['logo', () => screen.getByRole('link', { name: 'Takussan' })],
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

    for (const nom of ['Ouvrir le menu', 'Takussan']) {
      const element = nom === 'Takussan'
        ? screen.getByRole('link', { name: nom })
        : screen.getByRole('button', { name: nom });
      expect(anneauDeFocus(element)!.rentrant).toBe(false);
      expect(element.className).toMatch(/focus-visible:outline-offset-2\b/);
    }
  });
});
