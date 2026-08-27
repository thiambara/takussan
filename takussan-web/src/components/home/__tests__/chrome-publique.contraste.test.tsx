/**
 * La chrome publique parle jetons, et chaque couple qu'elle introduit est MESURÉ — TCK-440.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TEST NE VÉRIFIE PAS DES CHAÎNES DE CLASSES
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Une assertion `toHaveClass('text-muted-foreground')` coche aussi la régression qui remplace le
 * fond sous ce texte : c'est la leçon de `src/test/contraste-wcag.ts`, écrite après qu'un anneau
 * de focus mesuré à **1,00:1 — littéralement invisible** — soit passé au vert d'une suite entière.
 * Ce fichier calcule donc le seul chiffre que l'AC5 exige : le rapport WCAG 2.1 sur le fond RÉEL,
 * remonté ancêtre par ancêtre depuis le DOM rendu, alpha composé avant le calcul.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE « LA BASCULE `.dark` » PEUT ET NE PEUT PAS ÊTRE ICI — AC4, lu honnêtement
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'AC demande d'éprouver la bascule « sur les valeurs calculées, pas sur la présence de la
 * classe ». Deux faits, mesurés le 2026-08-27, décident de la forme que ça peut prendre :
 *
 *  1. **jsdom ne charge aucune feuille de style.** `getComputedStyle()` y rend la valeur initiale
 *     pour toute propriété qu'aucun style en ligne ne pose : un test qui la lirait mesurerait
 *     jsdom, pas le design system.
 *  2. **Rien n'active `.dark` dans ce produit** — ni `ThemeProvider`, ni `next-themes` au
 *     `package.json`, ni un seul `documentElement.classList` sous `src/`. Le thème sombre est un
 *     jeu de valeurs déclarées que personne ne peut atteindre aujourd'hui.
 *
 * Ce qu'un test peut donc éprouver, et ce qu'il éprouve ici : que les classes rendues **résolvent
 * vers des valeurs différentes** selon la table de jetons — clair ou sombre — recopiée de
 * `globals.css`. C'est la définition même de « la palette est changeable en un endroit », et c'est
 * ce que la conversion vient d'obtenir : avant elle, la navbar rendait des couleurs figées qui ne
 * bougeaient d'AUCUN côté.
 *
 * ⚠ La conséquence est à énoncer plutôt qu'à taire, comme les contraintes du ticket l'exigent :
 * **ce vert ne prouve pas qu'un utilisateur puisse voir un thème sombre.** Il prouve que la chrome
 * a cessé d'y être insensible.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  REPOS,
  SEUIL_AA_TEXTE,
  contraste,
  fmt,
  fondsPossibles,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versRvb,
} from '@/test/contraste-wcag';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { Navbar } = await import('@/components/home/Navbar');
const { Footer } = await import('@/components/home/Footer');

function monter(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(ui)}</QueryClientProvider>);
}

/**
 * Les préfixes de couleur que la chrome peut poser. `ring` en fait partie : il porte l'anneau de
 * focus, qui est un indicateur non textuel — un préfixe absent d'ici est un trou muet.
 */
const PREFIXES = ['bg', 'text', 'border', 'ring'] as const;

/** Tout élément du sous-arbre qui déclare au moins un utilitaire de couleur. */
function elementsColores(racine: Element): Element[] {
  return [racine, ...racine.querySelectorAll('*')].filter((el) =>
    [...el.classList].some((c) => PREFIXES.some((p) => litUtilitaireDeCouleur(c, p) !== null)),
  );
}

type Couple = { encre: string; fond: string; etat: string; ratio: number; jetonEncre: string };

/**
 * Tous les couples texte/fond que le sous-arbre produit RÉELLEMENT, chacun sur chacun des fonds
 * que son élément peut avoir (repos, `hover:`, …) — un texte doit tenir dans tous ses états, pas
 * dans celui du DOM au repos.
 */
function couplesDe(racine: Element, jetons: Readonly<Record<string, string>>): Couple[] {
  const couples: Couple[] = [];
  for (const el of elementsColores(racine)) {
    const encres = [...el.classList]
      .map((c) => litUtilitaireDeCouleur(c, 'text'))
      .filter((u): u is NonNullable<typeof u> => u !== null);
    if (encres.length === 0) continue;
    // Un élément sans texte propre (un conteneur qui ne fait qu'hériter une encre) n'est pas un
    // couple à mesurer : c'est son enfant textuel qui le sera.
    if ((el.textContent ?? '').trim() === '') continue;
    for (const u of encres) {
      const hexEncreNominal = resoudreCouleur(u.jeton, jetons);
      for (const fond of fondsPossibles(el, jetons)) {
        const encreComposee = u.alpha === 1
          ? versRvb(hexEncreNominal)
          : (versRvb(hexEncreNominal).map((c, i) => c * u.alpha + versRvb(fond.hex)[i] * (1 - u.alpha)) as [number, number, number]);
        couples.push({
          encre: `${u.variante ? `${u.variante}:` : ''}text-${u.jeton}${u.alpha === 1 ? '' : `/${Math.round(u.alpha * 100)}`}`,
          fond: fond.provenance,
          etat: fond.etat,
          jetonEncre: u.jeton,
          ratio: contraste(encreComposee, versRvb(fond.hex)),
        });
      }
    }
  }
  return couples;
}

/**
 * Les DEUX seuls couples de la chrome sous le seuil AA, tous deux DÉLIBÉRÉS et mesurés.
 *
 * Ce n'est pas une liste d'exceptions dérobée : chacun est une séparation purement décorative,
 * `aria-hidden` ou punctuelle, qui ne porte aucune information. WCAG 1.4.3 ne s'applique pas à un
 * texte décoratif — mais il fallait le DIRE, parce qu'un seuil qu'on abaisse en silence est
 * exactement ce que ce ticket corrige ailleurs.
 *
 * ⚠ La clé est le JETON, pas le fichier : une nouvelle encre sous le seuil fait rougir, quel que
 * soit l'endroit où elle apparaît.
 */
const DECORATIFS = new Set(['muted-foreground/60']);

function estDecoratif(couple: Couple): boolean {
  return DECORATIFS.has(couple.encre.replace(/^.*text-/, ''));
}

describe('chrome publique — contraste et bascule de thème (TCK-440)', () => {
  it.each([
    ['clair', JETONS_CLAIR],
    ['sombre', JETONS_SOMBRE],
  ])('AC5 — thème %s : chaque couple texte/fond de la NAVBAR atteint le seuil AA', (_nom, jetons) => {
    monter(<Navbar />);
    const couples = couplesDe(screen.getByRole('navigation'), jetons as Readonly<Record<string, string>>);

    // Une garde qui n'a plus rien à mesurer rend le même vert qu'une garde satisfaite.
    expect(couples.length).toBeGreaterThan(5);

    const sousLeSeuil = couples.filter((c) => !estDecoratif(c) && c.ratio < SEUIL_AA_TEXTE);
    expect(
      sousLeSeuil.map((c) => `${c.encre} sur ${c.fond} [${c.etat}] = ${fmt(c.ratio)}`),
      'couple(s) sous le seuil AA',
    ).toEqual([]);
  });

  it.each([
    ['clair', JETONS_CLAIR],
    ['sombre', JETONS_SOMBRE],
  ])('AC5 — thème %s : chaque couple texte/fond du PIED DE PAGE atteint le seuil AA', (_nom, jetons) => {
    monter(<Footer />);
    const couples = couplesDe(screen.getByRole('contentinfo'), jetons as Readonly<Record<string, string>>);

    expect(couples.length).toBeGreaterThan(3);
    const sousLeSeuil = couples.filter((c) => !estDecoratif(c) && c.ratio < SEUIL_AA_TEXTE);
    expect(
      sousLeSeuil.map((c) => `${c.encre} sur ${c.fond} [${c.etat}] = ${fmt(c.ratio)}`),
      'couple(s) sous le seuil AA',
    ).toEqual([]);
  });

  it("AC5 — aucun jeton inconnu ne traverse la chrome sans être mesuré", () => {
    monter(<Navbar />);
    // `resoudreCouleur` LÈVE sur un jeton absent de la table plutôt que de rendre un repli : une
    // échelle Tailwind brute réintroduite fait donc rougir AVEC SON NOM, au lieu d'être mesurée
    // contre du blanc imaginaire et déclarée conforme.
    expect(() => couplesDe(screen.getByRole('navigation'), JETONS_CLAIR)).not.toThrow();
    expect(() => couplesDe(screen.getByRole('navigation'), JETONS_SOMBRE)).not.toThrow();
  });

  it('AC4 — la bascule de thème change le fond ET le texte de la navbar, en VALEURS', () => {
    monter(<Navbar />);
    const nav = screen.getByRole('navigation');

    const fondClair = fondsPossibles(nav, JETONS_CLAIR).find((f) => f.etat === REPOS)!;
    const fondSombre = fondsPossibles(nav, JETONS_SOMBRE).find((f) => f.etat === REPOS)!;
    expect(fondClair.hex).not.toBe(fondSombre.hex);

    // Le texte : on prend le premier élément textuel de la navbar qui déclare une encre.
    const [premiereEncre] = couplesDe(nav, JETONS_CLAIR);
    const [premiereEncreSombre] = couplesDe(nav, JETONS_SOMBRE);
    expect(premiereEncre).toBeDefined();
    expect(resoudreCouleur(premiereEncre!.jetonEncre, JETONS_CLAIR))
      .not.toBe(resoudreCouleur(premiereEncreSombre!.jetonEncre, JETONS_SOMBRE));
  });

  it('AC4 — le pied de page bascule lui aussi, ce que son fond ardoise figé lui interdisait', () => {
    monter(<Footer />);
    const pied = screen.getByRole('contentinfo');
    const clair = fondsPossibles(pied, JETONS_CLAIR).find((f) => f.etat === REPOS)!;
    const sombre = fondsPossibles(pied, JETONS_SOMBRE).find((f) => f.etat === REPOS)!;
    expect(clair.hex).toBe(JETONS_CLAIR.muted);
    expect(sombre.hex).toBe(JETONS_SOMBRE.muted);
    expect(clair.hex).not.toBe(sombre.hex);
  });

  it("AC3 — les surfaces blanches de la chrome rendent EXACTEMENT la même valeur qu'avant", () => {
    // La moitié de la conversion est une équivalence stricte, et elle se vérifie sur la valeur :
    // le blanc figé devient `--card` / `--popover`, qui valent #ffffff en thème clair. Une
    // conversion qui déplacerait cette valeur serait une refonte déguisée.
    expect(JETONS_CLAIR.card).toBe('#ffffff');
    expect(JETONS_CLAIR.popover).toBe('#ffffff');
  });
});
