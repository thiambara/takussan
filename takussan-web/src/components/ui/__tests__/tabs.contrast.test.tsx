/**
 * TCK-359, revue adverse — L'ONGLET INACTIF SE MESURE SUR LES TROIS FONDS, PAS SUR UN SEUL.
 *
 * `text-foreground/60` avait été mesuré contre `--background` (4,53:1, « tient de 0,03 ») et
 * déclaré conforme. Mais `variant="line"` rend la `TabsList` transparente : rien ne repeint le
 * fond entre le déclencheur et son conteneur. Sur `/super-admin/reports`, ce conteneur est le
 * `<main>` du shell, qui porte `bg-muted` depuis TCK-358 — et la mesure y tombait à **4,35:1**,
 * sous le plancher AA de 4,5 pour du texte normal de 14 px.
 *
 * Ce test ne se contente donc PAS de figer une chaîne de classe : il RECALCULE le contraste à
 * partir de l'opacité réellement rendue, sur les trois fonds possibles, dans les deux thèmes.
 * Une opacité rabaissée rougit avec le chiffre qui la condamne, et un jour où `--muted` bougerait
 * dans `globals.css`, c'est ce test qui le dirait — pas une revue à l'œil.
 *
 * ⚠ `tabs.tsx` est une primitive PARTAGÉE (12 consommateurs) : les jetons ci-dessous sont recopiés
 * de `src/app/globals.css` à dessein. Un test qui lirait la feuille compilée mesurerait ce que
 * Tailwind a bien voulu émettre ; celui-ci mesure ce que le design system DÉCLARE.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { Tabs, TabsList, TabsTrigger } from '../tabs';

/** Jetons de `src/app/globals.css` — `:root` (clair) et `.dark` (sombre). */
const JETONS = {
  clair: { foreground: '#1f1812', fonds: { '--background': '#fcf9f3', '--card': '#ffffff', '--muted': '#f1ece0' } },
  sombre: { mutedForeground: '#b8aa97', fonds: { '--background': '#1f1812', '--card': '#2a2018', '--muted': '#3a2e23' } },
} as const;

const SEUIL_AA_TEXTE_NORMAL = 4.5;

function versRvb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** sRGB → composante linéaire (WCAG 2.x, §relative luminance). */
function lineaire(canal: number) {
  const s = canal / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, v, b]: [number, number, number]) {
  return 0.2126 * lineaire(r) + 0.7152 * lineaire(v) + 0.0722 * lineaire(b);
}

/**
 * Contraste WCAG 2.x. `alpha` compose l'encre SUR le fond AVANT le calcul — un ratio pris sur la
 * couleur nominale d'un `/70` ne mesure rien. Tailwind v4 émet
 * `color-mix(in oklab, #1f1812 70%, transparent)`, soit une couleur d'alpha 0,7 que le navigateur
 * compose ensuite en sRGB : la composition ci-dessous est bien celle du rendu.
 */
function contraste(encreHex: string, fondHex: string, alpha = 1) {
  const fond = versRvb(fondHex);
  const encre = versRvb(encreHex).map((c, i) => c * alpha + fond[i] * (1 - alpha)) as [number, number, number];
  const [haut, bas] = [luminance(encre), luminance(fond)].sort((a, b) => b - a);
  return (haut + 0.05) / (bas + 0.05);
}

function classesDuDeclencheurInactif() {
  const { container } = render(
    <Tabs defaultValue="a">
      <TabsList variant="line">
        <TabsTrigger value="a">actif</TabsTrigger>
        <TabsTrigger value="b">inactif</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
  const declencheurs = container.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]');
  expect(declencheurs).toHaveLength(2);
  return declencheurs[1].className.split(/\s+/);
}

describe('TabsTrigger — l’onglet inactif tient AA sur les trois fonds (TCK-359)', () => {
  it('mesure ≥ 4,5:1 en thème clair sur --background, --card ET --muted', () => {
    const classes = classesDuDeclencheurInactif();

    const encre = classes.find((c) => c.startsWith('text-foreground/'));
    expect(encre, 'l’onglet inactif doit porter une encre `text-foreground/<opacité>`').toBeDefined();

    const opacite = Number(encre!.split('/')[1]) / 100;
    expect(Number.isFinite(opacite)).toBe(true);

    for (const [nom, fond] of Object.entries(JETONS.clair.fonds)) {
      const ratio = contraste(JETONS.clair.foreground, fond, opacite);
      expect(
        ratio,
        `--foreground @${opacite * 100} % sur ${nom} (${fond}) = ${ratio.toFixed(4)}:1`,
      ).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE_NORMAL);
    }
  });

  it('mesure ≥ 4,5:1 en thème sombre, où l’encre bascule sur --muted-foreground', () => {
    const classes = classesDuDeclencheurInactif();

    // Sans cette bascule, l'encre sombre serait `--foreground` (#fcf9f3) à la même opacité, sur
    // des fonds sombres : la mesure ci-dessous porterait sur une autre couleur que le rendu.
    expect(classes).toContain('dark:text-muted-foreground');

    for (const [nom, fond] of Object.entries(JETONS.sombre.fonds)) {
      const ratio = contraste(JETONS.sombre.mutedForeground, fond);
      expect(
        ratio,
        `--muted-foreground sur ${nom} (${fond}) = ${ratio.toFixed(4)}:1`,
      ).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE_NORMAL);
    }
  });

  it('garde la `TabsList variant="line"` transparente — c’est ce qui rend le fond du PARENT décisif', () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList variant="line">
          <TabsTrigger value="a">a</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const liste = container.querySelector<HTMLElement>('[data-slot="tabs-list"]');
    // Si cette classe disparaissait au profit d'un fond opaque, la mesure ci-dessus changerait de
    // sujet : ce serait le fond de la liste qu'il faudrait mesurer, plus celui du conteneur.
    expect(liste!.className.split(/\s+/)).toContain('bg-transparent');
  });
});
