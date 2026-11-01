---
id: TCK-2461
title: "Les écrans du Radar revus : navigation, bandeau, liste, fiche, annonceur, collecte"
status: doing
phase: P1
family: radar
estimate: M
wave: 64
created: 2026-11-01
updated: 2026-11-01
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [radar, ui, ux]
---

## Objectif utilisateur

L'opérateur du Radar voit ce qui lui est demandé, se déplace d'un clic entre ses quatre espaces, et garde ses gestes à
portée, sans que rien de ce que font ces écrans ne change : mêmes données, mêmes gardes, mêmes `data-testid`.

## Défauts relevés au navigateur le 2026-11-01

- Le code brut `radar.claim.declined` affiché dans la colonne Motif ; la colonne date coupée à droite.
- Six tuiles de même poids, dont le coût IA tronqué, à côté d'un filtre qui les doublait.
- Trois boutons posés sur la seule liste, puis un « Retour » libellé différemment selon la page.
- Fiche : badge d'étape toujours neutre ; jusqu'à 16 rapprochements repoussant le formulaire et ses gestes.
- Annonceur : le panneau de relance repoussait l'identité et les annonces ; un délai ordinaire peint en rouge d'erreur.
- Collecte : Enregistrer, Activer et Lancer empilés sous le formulaire.

## Critères d'acceptation

- [x] `RadarNav` sur les quatre pages de premier niveau, entrée courante en `aria-current`, fiche comprise ; pastille des
      relances dues sur Annonceurs.
- [x] `BandeauDuRadar` : le parcours dans son ordre, chaque étape filtre et se retire au second clic ; un plafond IA atteint
      se voit sur le montant.
- [x] La liste ne défile plus à 1440 px ; `radar.claim.declined` a son libellé en fr, en, wo.
- [x] Fiche : la couleur d'étape est `STAGE_TONE` ; les rapprochements défilent chez eux à partir de `lg` ; la barre d'actions
      laisse la place du bouton de messagerie.
- [x] Annonceur : retour vers la file, relance après le travail principal, délai de relance en neutre.
- [x] Collecte : actions dans l'en-tête de la carte, Enregistrer dans le formulaire.
- [x] Mesuré au navigateur à 1440 et 390 px, aucun défilement du document.

## Hors périmètre

Sur mobile, les rapprochements ne défilent pas chez eux : un défilement imbriqué piège le doigt. La barre d'actions n'y colle
donc qu'une fois le formulaire atteint.
