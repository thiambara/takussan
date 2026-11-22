import type { ComponentProps, ReactNode } from 'react';

/**
 * TCK-2691 (ADR-0106, C1 et C2) — l'enveloppe du contenu de `/app` et la page « pleine largeur ».
 *
 * Les maquettes retenues n'ont AUCUNE enveloppe au téléphone : chaque écran porte sa marge (`px-4` sur
 * 139 écrans sur 204) et va bord à bord quand il le faut (filets, puces collantes, rangées de liste :
 * 62 des 172 écrans dans la coque — annexe C § 2.3). La coque imposait `px-4 py-6` à toute page : une
 * page refaite d'après la maquette y empilait une seconde marge, et rien n'y allait plus bord à bord.
 *
 * - L'enveloppe (`EnveloppeDuContenu`) garde `px-4 py-6` au téléphone pour toute page qui n'a pas
 *   adopté la pleine largeur : les pages existantes ne bougent pas.
 * - Une page qui rend `<PagePleineLargeur>` l'adopte : SOUS `md`, l'enveloppe perd sa marge (par
 *   `:has()`, en CSS seul — ni contexte, ni effet, ni saut au premier rendu) ; la page porte ses marges,
 *   élément par élément. Dès `md`, l'enveloppe garde la sienne.
 * - Au bureau (C2) : 24 px de `md` à `lg`, puis `px-8` (28,8 px sur l'échelle ×0,9) : la largeur utile de
 *   la maquette, 1110 px à 1440.
 *
 * Garde : `PagePleineLargeur.garde.test.ts` rougit si une page qui l'adopte pose une marge latérale sur
 * son conteneur — la seconde marge que la pleine largeur existe pour retirer.
 *
 * TCK-2804 — sous `md`, une page qui porte des onglets de page (`ONGLETS_DE_PAGE`, `console/PageHeader`) perd la
 * marge HAUTE de l'enveloppe : ses onglets commencent juste sous l'en-tête du téléphone (maquette, y = 56).
 */
export const ENVELOPPE_DU_CONTENU =
  'px-4 py-6 md:px-6 md:py-8 lg:px-8 max-md:has-[[data-pleine-largeur]]:p-0 max-md:has-[[data-onglets-de-page]]:pt-0';

/** TCK-2691 — l'enveloppe du contenu de la coque (`AppShell`), seule porteuse de la marge des pages. */
export function EnveloppeDuContenu({ children }: { readonly children: ReactNode }) {
  return (
    <div data-slot="enveloppe-du-contenu" className={ENVELOPPE_DU_CONTENU}>
      {children}
    </div>
  );
}

/**
 * TCK-2691 (C1) — la page adopte la pleine largeur au téléphone. Son conteneur ne porte AUCUNE marge
 * latérale (`px-*`, `p-*`, `ps-*`, `pe-*`, `pl-*`, `pr-*`, `mx-*`) : ce sont ses éléments qui la posent
 * (`px-4` sur un titre, rien sur une rangée qui va bord à bord).
 */
export function PagePleineLargeur({ children, ...props }: ComponentProps<'div'>) {
  return (
    <div data-pleine-largeur="" {...props}>
      {children}
    </div>
  );
}
