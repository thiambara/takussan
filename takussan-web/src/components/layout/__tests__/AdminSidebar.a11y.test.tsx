/**
 * TCK-371 — focus clavier de la barre `/admin` ; TCK-633 — elle ne liste plus que l'accessible.
 *
 * ## Ce fichier MESURE un contraste. Il ne fige plus une chaîne de classes.
 *
 * La version précédente n'éprouvait que des noms de classes, et une ablation a montré ce que ça
 * coûte : remplacer le fond de l'entrée active par `bg-primary` rendait l'anneau `--ring`
 * **exactement de la couleur de son propre fond — 1,00:1, littéralement invisible** — et les neuf
 * tests restaient VERTS. Un critère qu'une régression coche aussi ne garde rien.
 *
 * Ici, chaque assertion recalcule le rapport de contraste WCAG 2.1 (`@/test/contraste-wcag`) :
 *
 *   - **sur le fond RÉEL**, remonté du DOM rendu ancêtre par ancêtre, jamais supposé ;
 *   - **alpha composé AVANT le calcul** — `text-white/55` n'est pas du blanc ;
 *   - **sur TOUS les états** que l'élément peut prendre, `hover:` compris. C'est le cas qui avait
 *     échappé : l'entrée survolée pendant que le clavier la focalise.
 *
 * jsdom ne charge aucune feuille Tailwind — c'est pourquoi les jetons sont recopiés de
 * `globals.css` dans le harnais, comme le fait déjà `ui/__tests__/tabs.contrast.test.tsx`. Le test
 * mesure ce que le design system DÉCLARE, pas ce que Tailwind a bien voulu émettre.
 *
 * Trou déclaré : les couleurs posées par `style=` ou par une règle CSS ne sont pas vues. La barre
 * n'en pose aucune (vérifié).
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import {
  SEUIL_NON_TEXTUEL,
  anneauDeFocus,
  composer,
  contraste,
  fmt,
  fondsPossibles,
  versRvb,
} from '@/test/contraste-wcag';
import { AdminSidebar } from '../AdminSidebar';
import type { User } from '@/types/user';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: null }),
}));

const ADMIN_AGENCE = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  roles: ['agency_admin'],
  avatar_url: null,
} as unknown as User;

/**
 * ⚠ LES DEUX RENDUS COMPTENT, et l'un d'eux manquait.
 *
 * `agencyIsStandard={false}` est l'agence `individual` : depuis TCK-633, `/admin`, `/admin/team` et
 * `/admin/roles` ne sont plus DANS sa barre — sur `/admin`, elle n'a donc aucune entrée active. Le
 * fond `bg-white/10` de l'entrée active — celui dont l'anneau `--ring` mesurait 2,48:1 — n'est rendu
 * que par le fixture `standard`. Mesuré : un test qui ne rend que le premier ne voit que la barre nue
 * et laisse passer le défaut qu'il prétend garder. En revanche, `individual` rend la carte « Passer
 * en agence » (décision 1 du porteur) : ses fonds à elle sont mesurés comme le reste.
 *
 * Aucun `AccesAdminProvider` ici : la barre dérive ses pages du REPLI (`contexteDeRepli` : rôles et
 * `agencyIsStandard`, capacités inconnues).
 */
function rendreBarre(plan: 'individual' | 'standard' = 'individual') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <AdminSidebar user={ADMIN_AGENCE} agencyIsStandard={plan === 'standard'} />
      </QueryClientProvider>,
    ),
  );
}

const PLANS = ['individual', 'standard'] as const;

/** Tout ce que la barre rend de focusable : des liens réels — il n'y a plus d'entrée verrouillée. */
function elementsFocusables(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('a[href], button, [tabindex]:not([tabindex="-1"])'),
  );
}

describe('TCK-633 (AC1) — la barre ne liste que ce que le profil peut ouvrir', () => {
  it.each(PLANS)('aucune entrée verrouillée (agence %s)', (plan) => {
    rendreBarre(plan);
    expect(screen.queryAllByTitle('Réservé aux comptes pro')).toHaveLength(0);
    expect(document.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
  });

  it('agence individual : « Mon espace », et seulement les pages sans exigence « standard »', () => {
    rendreBarre('individual');
    expect(screen.getByRole('navigation', { name: 'Mon espace' })).toBeInTheDocument();
    const hrefs = Array.from(document.querySelectorAll('nav a')).map((a) => a.getAttribute('href'));
    // Le repli ne connaît pas les capacités : « Abonnement » (agency.update_billing) n'y est pas.
    expect(hrefs).toEqual([
      '/admin/agency',
      '/admin/agency/kyc',
      '/admin/finances',
      '/admin/settings/integrations',
    ]);
    // La carte « Passer en agence » est rendue, donc mesurée par les tests AC4 ci-dessous.
    expect(screen.getByRole('link', { name: 'Passer en agence' })).toBeInTheDocument();
  });

  it('agence standard : « Administration », tableau de bord en tête', () => {
    rendreBarre('standard');
    expect(screen.getByRole('navigation', { name: 'Administration' })).toBeInTheDocument();
    expect(document.querySelector('nav a')?.getAttribute('href')).toBe('/admin');
  });
});

describe('AC4 — anneau de focus : MESURÉ sur chaque fond que l’élément peut avoir', () => {
  /**
   * ⚠ C'est ici que la garde précédente laissait passer le pire correctif possible.
   *
   * Les trois fonds réels de la barre et les deux anneaux candidats (WCAG 2.1) :
   *
   *   barre nue        `bg-foreground` #1f1812   `outline-ring` 3,30:1   `outline-white` 17,53:1
   *   entrée ACTIVE    `bg-white/10`   #352f2a   `outline-ring` 2,48:1 ✗ `outline-white` 13,17:1
   *   entrée SURVOLÉE  `bg-white/5`    #2a241e   `outline-ring` 2,88:1 ✗ `outline-white` 15,39:1
   *
   * Le décalage NÉGATIF trace l'anneau DANS l'élément : son bord interne jouxte le fond propre de
   * l'entrée, pas celui de la barre. Deux des trois paires tombaient donc sous les 3:1 de
   * WCAG 1.4.11 — dont l'entrée active, et il y en a une sur CHAQUE page `/admin`.
   */
  it.each(PLANS)('chaque élément focusable déclare un anneau plein (agence %s)', (plan) => {
    rendreBarre(plan);

    const focusables = elementsFocusables();
    expect(focusables.length).toBeGreaterThan(5);

    for (const element of focusables) {
      const anneau = anneauDeFocus(element);
      expect(
        anneau,
        `« ${element.textContent?.trim()} » ne déclare aucun \`focus-visible:outline-<couleur>\``,
      ).not.toBeNull();
      // `outline-2` rend `outline-style: solid` : sans lui, Chrome et Safari gardent
      // `outline: auto` et IGNORENT `outline-color` — la couleur mesurée ne s'appliquerait pas.
      expect(element.className).toMatch(/focus-visible:outline-2\b/);
      // Le jeton à 50 % (`outline-ring/50`, l'idiome de `ui/button.tsx`) mesure 1,73:1 ici.
      expect(anneau!.alpha).toBe(1);
    }
  });

  it.each(PLANS)(
    'l’anneau tient ≥ 3:1 sur TOUS les fonds — repos, ACTIF et survolé (agence %s)',
    (plan) => {
      rendreBarre(plan);

      const etatsMesures = new Set<string>();
      for (const element of elementsFocusables()) {
        const anneau = anneauDeFocus(element)!;
        expect(anneau).not.toBeNull();

        for (const fond of fondsPossibles(element)) {
          // Le fond que l'anneau RENTRANT jouxte est celui-ci, pas celui de la barre.
          const ratio = contraste(
            composer(versRvb(anneau.hex), versRvb(fond.hex), anneau.alpha),
            fond.hex,
          );
          etatsMesures.add(fond.etat);
          expect(
            ratio,
            `« ${element.textContent?.trim()} » — ${anneau.classe} sur ${fond.hex} `
            + `(${fond.etat}, ${fond.provenance}) = ${fmt(ratio)}`,
          ).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
        }
      }

      // ⚠ Sans ces deux garanties, le test ne mesurerait que la barre NUE — la seule paire que
      // le rapport d'origine avait prise, et la seule qui passait. On vérifie la PROPRIÉTÉ, pas
      // une valeur : « l'état survolé a été mesuré » et « l'entrée active peint son propre fond,
      // et ce fond-là a été mesuré ». Un fond actif redessiné demain reste un correctif juste et
      // ne doit pas rougir ici — c'est un littéral figé qui produirait un faux rouge.
      expect(etatsMesures, 'aucun état `hover:` mesuré — c’est la souris qui repose sur la liste '
        + 'pendant que le clavier y navigue, et son fond composé était sous le seuil')
        .toContain('hover');

      if (plan === 'standard') {
        // TCK-633 — chez une agence `individual`, `/admin` n'est pas dans la barre : sur cette page,
        // aucune entrée n'est active. Le fond propre de l'entrée active n'existe QUE ici.
        const actif = document.querySelector<HTMLElement>('a[href="/admin"]')!;
        expect(actif, 'l’entrée active doit être un lien réel dans ce rendu').not.toBeNull();
        expect(
          fondsPossibles(actif).some((f) => !f.provenance.startsWith('hérité')),
          'l’entrée ACTIVE doit peindre son propre fond — c’est celui que l’anneau rentrant '
          + 'jouxte, et celui dont le contraste était tombé à 2,48:1',
        ).toBe(true);
      }
    },
  );

  it.each(PLANS)(
    'le décalage suit le conteneur : rentrant dans le `<nav>` qui coupe, sortant ailleurs (%s)',
    (plan) => {
      rendreBarre(plan);

      for (const element of elementsFocusables()) {
        const anneau = anneauDeFocus(element)!;
        // Le `<nav>` est en `overflow-y-auto` : dès qu'un axe n'est pas `visible`, l'autre calcule
        // `auto` (CSS Overflow 3 §3), et un anneau SORTANT y serait rogné. Hors du `<nav>`, rien
        // ne coupe — et sur le logo, lien EN LIGNE sans padding vertical, un anneau rentrant
        // affleure les glyphes au lieu de les entourer.
        const dansLeNav = element.closest('nav') !== null;
        expect(
          anneau.rentrant,
          `« ${element.textContent?.trim()} » : décalage `
          + `${anneau.rentrant ? 'rentrant' : 'sortant'} alors qu'il est `
          + `${dansLeNav ? 'DANS' : 'HORS'} du <nav> qui coupe`,
        ).toBe(dansLeNav);
        if (!anneau.rentrant) {
          expect(element.className).toMatch(/focus-visible:outline-offset-2\b/);
        }
      }
    },
  );
});
