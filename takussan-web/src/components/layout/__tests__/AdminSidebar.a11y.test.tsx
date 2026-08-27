/**
 * TCK-371 — lisibilité des entrées VERROUILLÉES et focus clavier de la barre `/admin`.
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
  SEUIL_AA_TEXTE,
  SEUIL_NON_TEXTUEL,
  anneauDeFocus,
  composer,
  contraste,
  fmt,
  fondHerite,
  fondsPossibles,
  litUtilitaireDeCouleur,
  resoudreCouleur,
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
 * `agencyIsStandard={false}` est l'agence `individual` : c'est elle qui voit les cadenas — mais
 * `/admin`, `/admin/team` et `/admin/roles` sont dans `PRO_ROUTES`, donc l'entrée ACTIVE y est un
 * `<span>` verrouillé sur le fond NU de la barre. Le fond `bg-white/10` de l'entrée active — celui
 * dont l'anneau `--ring` mesurait 2,48:1 — n'est JAMAIS rendu par ce fixture. Mesuré : un test qui
 * ne rend que celui-ci ne voit que la barre nue et laisse passer le défaut qu'il prétend garder.
 *
 * `standard` rend donc la même barre sans cadenas, entrée active comprise.
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

/** Encre effective d'un élément : son `text-<jeton>[/alpha]` composé sur le fond dont il hérite. */
function encreEffective(element: HTMLElement) {
  const utilitaire = Array.from(element.classList)
    .map((c) => litUtilitaireDeCouleur(c, 'text'))
    .find((u) => u !== null && u.variante === '');
  expect(utilitaire, `${element.textContent} : aucune encre \`text-*\` déclarée`).toBeTruthy();

  const fond = fondsPossibles(element)[0];
  const hex = resoudreCouleur(utilitaire!.jeton);
  return {
    ratio: contraste(composer(versRvb(hex), versRvb(fond.hex), utilitaire!.alpha), fond.hex),
    alpha: utilitaire!.alpha,
    fond,
  };
}

/** Tout ce que la barre rend de focusable : liens réels + l'entrée verrouillée `tabindex=0`. */
function elementsFocusables(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('a[href], button, [tabindex]:not([tabindex="-1"])'),
  );
}

describe('AC1 — contraste des entrées verrouillées', () => {
  it('mesure ≥ 4,5:1 sur le fond RÉEL de la barre, et une seule atténuation la porte', () => {
    rendreBarre();

    const verrouillees = screen.getAllByTitle('Réservé aux comptes pro');
    expect(verrouillees.length).toBeGreaterThan(0);

    for (const entree of verrouillees) {
      // Le défaut d'origine : `opacity-60` MULTIPLIAIT l'alpha de `text-white/40`, et deux classes
      // anodines prises séparément composaient 0,24 sans que rien ne le signale. `opacity` atténue
      // en plus le cadenas et l'icône, qui portent déjà l'interdit.
      expect(entree.className).not.toMatch(/\bopacity-\d+\b/);

      const { ratio, fond } = encreEffective(entree);
      // Avant : alpha 0,24 → #554f4b sur #1f1812 → 2,18:1. Après : 6,04:1.
      expect(
        ratio,
        `entrée verrouillée sur ${fond.hex} (${fond.provenance}) : ${fmt(ratio)}`,
      ).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    }
  });

  it("garde l'entrée verrouillée LISIBLE mais plus sourde que l'item inactif", () => {
    rendreBarre();

    const verrouillee = screen.getAllByTitle('Réservé aux comptes pro')[0];
    // `role="link"` est porté AUSSI par le <span> verrouillé : on prend un lien réel non actif.
    const inactif = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('aria-disabled') !== 'true'
        && Array.from(l.classList).some((c) => c.startsWith('text-white/')))!;
    expect(inactif).toBeDefined();

    const sourde = encreEffective(verrouillee);
    const normale = encreEffective(inactif);

    // Les deux lisibles (6,04:1 et 9,04:1)…
    expect(sourde.ratio).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    expect(normale.ratio).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    // …et l'ordre tient : le cadenas et `cursor-not-allowed` portent l'interdit, l'atténuation
    // ne fait que le seconder. Une verrouillée AUSSI franche que l'item normal serait le défaut
    // inverse de celui d'origine.
    expect(sourde.ratio).toBeLessThan(normale.ratio);
    expect(verrouillee.className).toMatch(/\bcursor-not-allowed\b/);
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
        // `/admin` est dans `PRO_ROUTES` : chez une agence `individual` l'entrée active est un
        // <span> verrouillé sur le fond nu. Le fond propre de l'entrée active n'existe QUE ici.
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

describe('objectif du ticket — le cadenas s’ATTEINT et se LIT au clavier', () => {
  /**
   * L'entrée verrouillée était un `<span role="link" aria-disabled="true" title="…">` sans
   * `tabIndex` : hors de l'ordre de tabulation, et le `title` — SEUL endroit où la raison du
   * cadenas était écrite — n'est servi qu'au pointeur. « L'admin d'agence LIT ce qu'un passage en
   * standard lui débloquerait » n'était donc atteint qu'à la souris.
   */
  it('est dans l’ordre de tabulation et annonce sa raison dans son nom accessible', () => {
    rendreBarre();

    const verrouillees = screen.getAllByTitle('Réservé aux comptes pro');
    for (const entree of verrouillees) {
      expect(entree.getAttribute('tabindex')).toBe('0');
      // Inopérante, et elle le dit : ni `href` ni gestionnaire de clic.
      expect(entree.getAttribute('aria-disabled')).toBe('true');
      expect(entree.hasAttribute('href')).toBe(false);
      // La raison entre dans le NOM ACCESSIBLE, pas seulement dans l'infobulle du pointeur.
      expect(entree.textContent).toContain('Réservé aux comptes pro');
    }
  });

  it('reste sur le fond nu de la barre — donc l’anneau y est mesuré comme les autres', () => {
    rendreBarre();

    const entree = screen.getAllByTitle('Réservé aux comptes pro')[0];
    expect(fondHerite(entree).hex).toBe(resoudreCouleur('foreground'));
  });
});
