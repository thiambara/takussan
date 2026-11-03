---
id: TCK-1237
title: "L'en-tête et le pied des PDF en tableau à deux cellules : dompdf aligne le badge et la pagination à droite"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-109--images-des-pdf-rendus-par-dompdf"
tags: [api, pdf, dompdf, pistes]
---

## Contexte

Réf : **P109.03** du fichier de pistes, `validé (délégué)`.

`header.pdf-header` et `footer.pdf-footer` de `pdf.layouts.base` sont en `display: flex;
justify-content: space-between`. dompdf 3 ramène `flex` à `block` et ignore `justify-content` :
le badge `.label` passait sous le nom de l'agence, à gauche (mesuré : nom en x 51 / y 747, badge en
x 60 / y 726), et la pagination suivait la note dans le pied (x 287).

## Décision du porteur (déléguée)

« validé (délégué) — réécrire `header.pdf-header` et `footer.pdf-footer` de `base.blade.php` en tableau à deux cellules qui reproduit la mise en page déjà écrite par le CSS actuel (logo ou nom de l'agence à gauche, badge `.label` à droite sur la même ligne ; note à gauche, pagination à droite), sans autre changement visuel (polices, couleurs, textes, marges) ; garde : positions lues dans le flux non compressé d'un rendu dompdf, badge à droite du nom et à la même hauteur, pagination à droite de la note »

Critère accordé : V7.

### Choix de l'implémenteur

- Une classe commune `table.pdf-row` (largeur pleine, cellules sans marge, `vertical-align:
  middle` — l'`align-items: center` de l'en-tête) ; la seconde cellule `pdf-row-end` est alignée à
  droite, sans retour à la ligne.
- `.label` passe en `inline-block` : élément flexible, le `div` prenait la largeur de son contenu ;
  dans une cellule, il aurait pris toute sa largeur.
- Bordures, marges, polices, couleurs et textes inchangés.

## Objectif

dompdf rend l'en-tête et le pied comme le CSS les écrit.

## Delta à produire

- [x] En-tête : logo ou nom dans la première cellule, badge dans la seconde, à droite.
- [x] Pied : note dans la première cellule, pagination dans la seconde, à droite.
- [x] Test des positions lues dans le flux d'un rendu dompdf.

## Critères d'acceptation

- [x] AC1 — Le badge est dans la moitié droite de la page, à moins de 12 pt de la hauteur du nom.
- [x] AC2 — La pagination est à droite du pied (x > 400), sur la ligne de la note.
- [x] AC3 — Les marqueurs `.page-number` et `.page-total` restent (TCK-1235 lit le second).

## Hors périmètre

- Un contrat déjà envoyé en signature reste figé dans `signed_contract` avec son ancienne mise en
  page : rien n'est réécrit.

## Notes d'implémentation

- Après correctif, mesuré : nom en x 51 / y 747, badge en x 500 / y 753 (centré sur la ligne, les
  deux corps de police diffèrent) ; « Page » en x 488 sur la ligne de la note.
- Le badge s'écrit avec un opérateur `Tc` (espacement des lettres) autour du `TJ` : l'aide
  `textRuns()` du test l'accepte de part et d'autre.
- Ablation : `base.blade.php` remis à `HEAD` → 1 rouge (« 60.024 is greater than 297 ») ;
  correctif remis → 4/4 verts.
