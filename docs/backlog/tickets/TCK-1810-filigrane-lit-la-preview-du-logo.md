---
id: TCK-1810
title: "Le filigrane lit la `preview` du logo de l'agence, et seulement quand la conversion n'est pas déjà filigranée"
status: doing
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-180--images-téléversées-sans-borne-de-pixels-face-aux-décodages-gd-qui-les-suivent"
tags: [api, media, filigrane, performance, pistes]
---

## Objectif utilisateur

Réf : **P180.01** du fichier de pistes (classement A2).

Un worker `media` (384 Mo) ne décode plus le logo original de l'agence, jusqu'à 20 Mpx, pour en
poser une vignette de 60 à 320 px sur chaque conversion de chaque photo.

## Contrat de données

Aucun changement de ce que l'API rend. Le logo a déjà une conversion `preview` (PNG, `Fit::Max`
320 × 320, `Agency::registerMediaConversions()`, TCK-1425).

## Contraintes strictes (métier)

- Résultat inchangé : le logo posé a la même largeur qu'avant (`scaleDown` à 20 % de la largeur de
  la conversion). La `preview` n'est lue que **produite et au moins aussi large que la cible** ;
  sinon, l'original, comme avant (`Mesure` du mesureur).
- Une panne du disque lève toujours (le job est rejoué) ; un logo déclaré mais absent du disque
  donne toujours un filigrane sans logo.

## Delta à produire

- [ ] `AgencyWatermarkContext` : le logo se lit à la demande, par `logoFor(int $largeurCible)`,
  qui choisit la `preview` produite et assez large, sinon l'original.
- [ ] `WatermarkService::apply()` demande le logo à la largeur qu'il posera.
- [ ] `ApplyWatermarkJob` construit le contexte sous le verrou, après le test « déjà filigrané ».
- [ ] Tests dans `tests/Feature/Media/ApplyWatermarkJobTest.php`.

## Critères d'acceptation

- [ ] AC1 — `preview` produite, large de 320 px, original absent du disque : `logoFor(60)` rend
  les octets de la `preview`.
- [ ] AC2 — `preview` non produite, ou plus étroite que la cible : l'original.
- [ ] AC3 — Un job sur une conversion déjà filigranée ne lit pas le logo.

## Hors périmètre

- Rendre `logo_url` sur la `preview` (P180.03, reste du porteur).

## Hypothèses (mode sans humain)

- La largeur de la `preview` se lit par `getimagesizefromstring()`, qui lit l'en-tête sans décoder
  les pixels ; la conversion ne pèse que quelques dizaines de Ko.
- Le contexte garde son paramètre `logo` (octets fixes) pour les tests unitaires du service, et
  prend en plus un lecteur ; `fromAgency()` ne passe que le lecteur.

## Notes d'implémentation

_(à remplir par implementing-specs)_
