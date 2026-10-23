---
id: TCK-1887
title: "L'avatar est réduit sous 2 Mo avant d'être jugé trop lourd"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-195--seuils-de-saisie-recopiés-en-constantes-du-front-face-à-la-règle-de-lapi"
tags: [front, profil, médias, pistes]
---

## Objectif utilisateur

Une photo de téléphone choisie comme avatar est acceptée dès que sa version réduite tient sous les
2 Mo de l'API, au lieu d'être refusée avant toute réduction.

## Contexte

Réf : **P195.03** du fichier de pistes, `retenu · autonome` (A1 : la règle « réduire avant de
juger la taille » est écrite par TCK-542 et appliquée par `MediaDropzone` depuis TCK-596).

`ProfileHeader` refusait au choix tout fichier de plus de 2 Mo, puis réduisait à l'envoi : la
réduction ne servait qu'aux fichiers déjà sous le plafond.

## Hypothèses (mode sans humain)

- La réduction se fait au choix (comme `MediaDropzone`), et c'est le fichier réduit qui sert
  d'aperçu et part à l'envoi : l'envoi ne réduit plus une seconde fois.
- Le message `imageTooLarge` reste celui d'aujourd'hui : aucun texte neuf.
- Le test double le module `@/lib/reduire-photo`, comme les tests voisins : le composant n'expose
  pas les outils d'image.

## Delta à produire

- [x] `ProfileHeader` : `reduirePhotoSousPlafond(file, 2 Mo)` avant le contrôle de taille.
- [x] Tests dans `ProfileHeader.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Un fichier de 5 Mo que la réduction ramène sous 2 Mo n'affiche pas `imageTooLarge` et part réduit.
- [x] AC2 — Un fichier qui reste au-dessus de 2 Mo une fois réduit est refusé avec `imageTooLarge`.

## Hors périmètre

- Mesurer sur une vraie photo de téléphone qu'elle passe sous 2 Mo (navigateur).

## Notes d'implémentation

- Ablation : contrôle de taille remis sur le fichier brut, avant la réduction → AC1 rouge ; remis → 6 verts.
- Le test TCK-542 voisin double désormais `reduirePhotoSousPlafond` au lieu de `reduirePhoto`.
