---
id: TCK-2804
title: "Au téléphone, les onglets d'une page montent sous l'en-tête et y collent au défilement : le gabarit PageHeader, pour toutes les pages à onglets"
status: todo
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#25-reporting--tableaux-de-bord"
tags: [front, gabarit, page-header, onglets, telephone, fidelite, suite-de-tck-2628, audit-ux, app]
---

## Objectif utilisateur

Au téléphone, sur une page à onglets, l'utilisateur voit les onglets dès le haut de l'écran et les garde sous le
pouce quand il fait défiler la page, pour changer d'onglet sans remonter.

## Contrat de données

**Origine.** Relevé de fidélité de TCK-2628 (fid-rapports), écart ouvert **O1** de
`docs/qa/audit-ux-2026-11/fidelite/TCK-2628.json`, reporté hors de TCK-2801 parce qu'il tient au gabarit et non à
Rapports.

**Mesure** (fiche de fidélité, écrans a-0, a-7 et a-8, téléphone) :

- Produit : la barre d'onglets est à y = 100 (texte à y ≈ 122). Maquette : y = 56 (texte à y ≈ 78). L'écart est de
  44 px.
- Après un défilement de 700 px, la barre est partie avec la page. La maquette la garde collée sous l'en-tête
  (`app-rapports.tsx`, `sticky top-0 z-20` sous l'en-tête).
- Masquer l'en-tête de page sous `md` ne change rien : les 44 px viennent de la marge haute du contenu de `<main>`
  (`EnveloppeDuContenu`, `AppShell`) et du `mt-5` de l'emplacement `dessous` de `PageHeader`.

**Relu sur HEAD (`ebc494478`) le 2026-11-14.** `src/components/console/PageHeader.tsx` rend
`{dessous ? <div className="mt-5">{dessous}</div> : null}` sans aucune règle `sticky`. Le `<main>` d'`AppShell`
est le conteneur qui défile (`overflow-y-auto`). Seize appelants passent `dessous` hors du terrain de jeu. Certains y
mettent des onglets (Rapports, Baux, Réservations, Visites, Interventions…), d'autres une barre de filtres.

**Aucun changement d'API.**

## Direction UX / Artistique

Fidèle aux maquettes de la console (`playground/maquettes/pages/app/`), qui font foi : au téléphone, les onglets
soulignés d'une page commencent juste sous l'en-tête du téléphone, défilent horizontalement quand ils débordent, et
restent collés sous l'en-tête pendant que le contenu défile. La barre collée a un fond plein et un filet bas, sans
ombre. Au bureau, rien ne change.

## Contraintes strictes (métier)

- **La règle vaut pour le gabarit, pas page par page.** Toute page dont `dessous` porte des onglets de page en hérite,
  sans code propre à chaque page.
- **Une barre de filtres n'est pas un onglet.** Le ticket inventorie les seize appelants de `dessous` et classe
  chacun (onglets ou filtres). Seuls les onglets collent, sauf si la maquette de la page dit autre chose. Le
  classement est écrit dans les notes.
- La barre collée ne passe ni sous l'en-tête du téléphone ni sous les bandeaux du site qui défilent dans `<main>`
  (TCK-572). Elle ne recouvre pas la barre d'action collante du bas (TCK-2689).
- Rien ne change au-dessus de `md` : position et marges du bureau identiques, au pixel.
- Le DOM des appelants sans `dessous` ne change pas d'un nœud (engagement de TCK-2687).

## Delta à produire

- [ ] Le gabarit `PageHeader` place les onglets de page à la hauteur de la maquette au téléphone et les fait coller
  sous l'en-tête au défilement.
- [ ] Inventaire et classement des seize appelants de `dessous`.
- [ ] Mise à jour de l'écart O1 dans `TCK-2628.json` (statut, preuve), et relevé de fidélité rejoué sur Rapports et
  sur une seconde page à onglets.
- [ ] Tests vitest du gabarit.

## Critères d'acceptation

- [ ] AC1 — Relevé au navigateur à 360 px sur Rapports : la barre d'onglets est à y = 56 ± 2 (texte à y ≈ 78), la
  valeur de la maquette. Même relevé sur une seconde page à onglets (Baux ou Réservations), même valeur.
- [ ] AC2 — Même largeur, après un défilement de 700 px : la barre d'onglets est toujours visible, à la même hauteur
  sous l'en-tête. Le relevé lit sa position, pas sa seule présence dans le DOM.
- [ ] AC3 — À 1280 px, la position de la barre d'onglets et la marge au-dessus sont celles d'avant, au pixel près, et
  elle ne colle pas si la maquette du bureau ne le dit pas.
- [ ] AC4 — Une page dont `dessous` porte une barre de filtres classée « filtres » ne colle pas.
- [ ] AC5 — Test vitest du gabarit : `PageHeader` sans `dessous` rend exactement le DOM d'avant.
- [ ] AC6 — Vérifié par ablation, une à la fois : la règle collante retirée rend AC2 rouge ; l'ancien `mt-5` remis au
  téléphone rend AC1 rouge.

## Hors périmètre

- Les autres écarts de fidélité de Rapports (TCK-2801).
- Le défilement horizontal des onglets eux-mêmes, s'il est déjà conforme.
- Les consoles hors de `/app` (`/super-admin`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
