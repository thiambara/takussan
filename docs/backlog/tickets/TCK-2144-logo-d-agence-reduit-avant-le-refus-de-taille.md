---
id: TCK-2144
title: "Le logo d'agence est réduit sous 2 Mo avant d'être jugé trop lourd"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-222--photos-et-pièces-téléversées-hors-de-mediamanager-et-mediadropzone"
tags: [front, agence, médias, pistes]
---

## Objectif utilisateur

Une photo choisie comme logo d'agence est acceptée dès que sa version réduite tient sous les 2 Mo
de l'API, au lieu d'être refusée avant toute réduction.

## Contexte

Réf : **P222.03** du fichier de pistes, `retenu · autonome` (A1 : la règle « réduire avant de
juger la taille » est écrite par TCK-542 et appliquée à l'avatar par TCK-1887).

`AgencyConfigForm` jugeait le fichier brut par `validateAgencyLogoFile` (2 Mo), puis réduisait par
`reduirePhoto` à l'envoi : la réduction ne servait qu'aux fichiers déjà sous le plafond.

## Hypothèses (mode sans humain)

- La réduction se fait au choix, par `reduirePhotoSousPlafond(file, AGENCY_LOGO_MAX_BYTES)`, et
  c'est le fichier réduit qui est jugé, sert d'aperçu et part à l'envoi : l'envoi ne réduit plus
  une seconde fois.
- Le message `logoTooLarge` reste celui d'aujourd'hui : aucun texte neuf.
- Le contrôle de type de `validateAgencyLogoFile` s'applique au fichier réduit, dont le format ne
  change jamais (`reduirePhoto` garde le type) : son verdict est le même que sur le brut.
- Le test double le module `@/lib/reduire-photo`, comme `ProfileHeader.test.tsx`.

## Delta à produire

- [x] `AgencyConfigForm.handleLogoPick` : `reduirePhotoSousPlafond(file, AGENCY_LOGO_MAX_BYTES)` avant `validateAgencyLogoFile`.
- [x] Test Vitest dédié dans `src/components/admin-agency/__tests__/`.

## Critères d'acceptation

- [x] AC1 — Un logo de 5 Mo que la réduction ramène sous 2 Mo n'affiche pas `logoTooLarge` et part réduit à `uploadAgencyLogoAction`.
- [x] AC2 — Un logo qui reste au-dessus de 2 Mo une fois réduit est refusé avec `logoTooLarge`, sans appel à l'action.

## Hors périmètre

- Mesurer sur une vraie photo de logo de 3 à 8 Mo qu'elle passe sous 2 Mo (navigateur).

## Notes d'implémentation

- Ablation : `validateAgencyLogoFile` remis sur le fichier brut (avant la réduction) → AC1 rouge (aucun envoi, `logoTooLarge` affiché) ; remis → 2 verts.
- `handleLogoPick` devient asynchrone : la cible de l'événement est gardée dans `input` avant le premier `await`, et c'est elle qu'on vide.
- La garde `reduire-photo.branchement.test.ts` accepte déjà `await reduirePhotoSousPlafond(` (TCK-1887) : inchangée, verte.
