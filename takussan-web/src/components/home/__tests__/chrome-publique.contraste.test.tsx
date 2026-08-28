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
 *  2. **Aucune BASCULE globale n'existe** — ni `ThemeProvider`, ni `next-themes` au
 *     `package.json`, ni un seul `documentElement.classList` sous `src/`. Aucun utilisateur ne
 *     peut demander le thème sombre.
 *
 * ⚠⚠ **CORRECTION DU 2026-08-28, en DEUX temps — et le second temps est le plus instructif.**
 *
 * Ce paragraphe disait « rien n'active `.dark` dans ce produit ». **C'était faux** : la classe est
 * posée en toutes lettres comme SURFACE locale (TCK-358). L'erreur venait d'un angle mort — on
 * avait cherché un MÉCANISME (`ThemeProvider`, `next-themes`, `documentElement`), pas une classe
 * littérale dans un `className`.
 *
 * **Puis la correction elle-même a énuméré DEUX composants, et il y en a TROIS.** La troisième
 * passe par un portail (`SuperAdminShell.tsx:80`, un `<SheetContent className="dark …">` rendu au
 * niveau du `body`), donc hors position d'arbre. *Le texte écrit pour fermer une énumération
 * incomplète en était une.*
 *
 * ⚠⚠ **Et la commande de dérivation qui a remplacé cette liste faisait 3 SUR 7 — en rendant le
 * bon compte.** Elle exigeait un guillemet juste avant `dark`, alors que le séparateur d'une liste
 * de classes est une ESPACE ; elle donnait trois parce que les trois posages réels écrivent `dark`
 * en premier. *Une commande qui rend le bon nombre sur les cas existants n'est pas une dérivation,
 * c'est une énumération déguisée.* Corrigée ci-dessous (6 sur 7). Le septième — `clsx({ dark: x })`
 * — est hors de portée de tout grep, `dark:` étant aussi le préfixe de la variante.
 *
 * Ne pas recopier la liste : la dériver —
 *
 *     grep -rnE "(['\"`]|[[:space:]])dark([[:space:]]|['\"`])" takussan-web/src --include='*.tsx'
 *
 * Le détail et la leçon de forme sont dans `src/test/contraste-wcag.ts`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * L'AC4 RE-JUGÉE UNE FOIS LA PRÉMISSE REDRESSÉE — conclusion tenue, justification changée
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La conclusion **tient**, et il faut dire pourquoi elle tient AUTREMENT : la navbar publique
 * n'est jamais dans un sous-arbre `.dark` — les deux composants qui posent la classe sont
 * ailleurs, dans la console — et aucune bascule globale n'existe. Le rendu sombre de la NAVBAR
 * reste donc inatteignable, mais pas parce que « rien n'active `.dark` » : parce que ce qui
 * l'active ne l'enveloppe pas.
 *
 * ⚠ **Ce que ça retire à ce fichier, et qu'il faut lire avant de s'appuyer dessus** : la moitié
 * « sombre » des mesures ci-dessous porte sur une configuration qui **ne peut pas se produire pour
 * la chrome publique**. Elle garde la COHÉRENCE des jetons — utile, et ce serait la première chose
 * à casser le jour où une bascule existe — mais elle n'est PAS le témoignage d'un écran lisible.
 * Pour la chrome super-admin, les mêmes jetons gardent un écran réellement rendu ; ce n'est pas le
 * cas ici, et confondre les deux ferait croire à une garantie qu'on n'a pas.
 *
 * Ce que ce fichier éprouve donc, exactement : que les classes rendues **résolvent vers des
 * valeurs différentes** selon la table de jetons — clair ou sombre. C'est la définition de « la
 * palette est changeable en un endroit », et c'est ce que la conversion a obtenu : avant elle, la
 * navbar rendait des couleurs figées qui ne bougeaient d'AUCUN côté.
 *
 * ⚠ **Ce vert ne prouve pas qu'un utilisateur puisse voir un thème sombre.** Il prouve que la
 * chrome a cessé d'y être insensible.
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

  it('AC4 — thème clair et sombre résolvent des VALEURS différentes pour la navbar', () => {
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

  it("AC4 — le pied de page suit lui aussi les jetons, ce que son fond ardoise figé lui interdisait", () => {
    monter(<Footer />);
    const pied = screen.getByRole('contentinfo');
    const clair = fondsPossibles(pied, JETONS_CLAIR).find((f) => f.etat === REPOS)!;
    const sombre = fondsPossibles(pied, JETONS_SOMBRE).find((f) => f.etat === REPOS)!;
    expect(clair.hex).toBe(JETONS_CLAIR.muted);
    expect(sombre.hex).toBe(JETONS_SOMBRE.muted);
    expect(clair.hex).not.toBe(sombre.hex);
  });

  /**
   * LES DEUX SURFACES, ET NON CELLE QUI ARRANGE.
   *
   * Le test au-dessus mesure les couples sur le fond RÉEL de chaque élément — c'est ce qu'il faut
   * pour juger le rendu d'aujourd'hui, et c'est insuffisant pour juger un JETON. Une encre de la
   * chrome ne reste pas où on l'a posée : elle est reprise dans une carte (`--card`, blanc en
   * clair) comme dans une section de page (`--background`, Lin), et **les deux surfaces se
   * trompent en sens opposés selon le thème** — `--card` est plus CLAIR que `--background` en
   * thème clair, et plus SOMBRE que lui en thème sombre. Mesurer sur une seule, c'est choisir
   * celle qui arrange.
   *
   * C'est le trou qu'a payé `check-chart-contrast.mjs`, qui ne mesurait que `--card`.
   *
   * ── LES MARGES, CONSIGNÉES (WCAG 2.1, seuil AA texte = 4,5:1) ────────────────────────────────
   *
   *                          --card   --background   marge   écart entre surfaces
   *   clair  foreground      17,53       16,69       +12,19        0,85
   *          muted-fg         5,72        5,44        +0,94        0,28
   *          primary          5,32        5,06        +0,56        0,26
   *   sombre foreground      15,16       16,69       +10,66        1,53
   *          muted-fg         7,01        7,71        +2,51        0,71
   *          primary          4,83        5,31        +0,33        0,49
   *
   * ⚠ **Le sens de l'écart s'INVERSE avec le thème** : `--card` est plus contrasté que
   * `--background` en clair, moins en sombre. C'est exactement pourquoi une seule surface ne
   * suffit pas — celle qui arrange n'est pas la même des deux côtés.
   *
   * ⚠ **Ce que la mesure sur les deux surfaces a trouvé, et que ce test NE couvre PAS** :
   * `--accent` sur `--card` en thème sombre rend **4,48:1**, sous le seuil de 0,02 — alors qu'il
   * rend 4,93:1 sur `--background`. Son seul emploi sur la surface publique est l'icône
   * `aria-hidden` de `search/WidenedSearchNotice.tsx`, donc un contenu NON TEXTUEL, gouverné par
   * le seuil de 3:1 (WCAG 1.4.11) et non par celui-ci. Il est ANTÉRIEUR à TCK-440 — vérifié, ce
   * ticket n'a introduit aucun `text-accent`. Consigné plutôt que corrigé, et hors du relevé
   * ci-dessous qui ne couvre que la navbar et le pied de page.
   */
  it.each([
    ['clair', JETONS_CLAIR],
    ['sombre', JETONS_SOMBRE],
  ])('AC5 — thème %s : chaque encre de la chrome tient sur --card ET sur --background', (_nom, jetons) => {
    // ⚠ Deux rendus SÉPARÉS, et non un arbre commun : le pied de page rend ses colonnes dans des
    // `<nav>`, si bien qu'un `getByRole('navigation')` sur l'arbre réuni échoue sur « multiple
    // elements » — un rouge qui accuse le contraste alors que c'est la requête qui est fausse.
    const { container: bandeau } = monter(<Navbar />);
    const { container: pied } = monter(<Footer />);
    const table = jetons as Readonly<Record<string, string>>;

    const encres = new Set<string>();
    for (const racine of [bandeau, pied]) {
      for (const el of elementsColores(racine)) {
        for (const c of el.classList) {
          const u = litUtilitaireDeCouleur(c, 'text');
          // Les encres à alpha sont mesurées par le test au-dessus, sur leur fond réel : ici on
          // juge le JETON, pas une composition.
          if (u && u.alpha === 1 && u.jeton !== 'transparent') encres.add(u.jeton);
        }
      }
    }
    expect(encres.size, 'aucune encre relevée — le relevé est cassé, pas la chrome').toBeGreaterThan(2);

    const echecs: string[] = [];
    for (const jeton of encres) {
      // Une encre POSÉE sur une surface n'est pas jugée contre elle-même : `text-background` sur
      // `--background` n'existe pas, c'est le remplissage inverse d'un bouton.
      for (const surface of ['card', 'background'] as const) {
        if (jeton === surface || jeton === `${surface}-foreground`) continue;
        if (jeton === 'background' || jeton === 'primary-foreground') continue;
        const r = contraste(versRvb(resoudreCouleur(jeton, table)), versRvb(resoudreCouleur(surface, table)));
        if (r < SEUIL_AA_TEXTE) echecs.push(`text-${jeton} sur --${surface} = ${fmt(r)}`);
      }
    }
    expect(echecs, 'encre(s) sous le seuil AA sur une des deux surfaces').toEqual([]);
  });

  it("AC3 — les surfaces blanches de la chrome rendent EXACTEMENT la même valeur qu'avant", () => {
    // La moitié de la conversion est une équivalence stricte, et elle se vérifie sur la valeur :
    // le blanc figé devient `--card` / `--popover`, qui valent #ffffff en thème clair. Une
    // conversion qui déplacerait cette valeur serait une refonte déguisée.
    expect(JETONS_CLAIR.card).toBe('#ffffff');
    expect(JETONS_CLAIR.popover).toBe('#ffffff');
  });
});
