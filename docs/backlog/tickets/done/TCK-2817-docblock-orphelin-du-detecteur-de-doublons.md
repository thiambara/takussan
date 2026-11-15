---
id: TCK-2817
title: "Le docblock de CustomerDuplicateDetector::numeroComplet() revient sur sa méthode"
status: done
phase: P3
family: technique
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
tags: [back, crm, doublons, docblock, dette-de-lecture]
---

## Objectif utilisateur

Le développeur qui lit `numeroComplet()` trouve sa règle au-dessus d'elle, et non au-dessus d'une autre méthode.

## Contrat de données

**Origine.** Relevé de tickets-suites (2026-11-14).

**Constat, relu sur HEAD (`765093279`) le 2026-11-14.** Dans `app/Services/Crm/CustomerDuplicateDetector.php`, deux
docblocks se suivent au-dessus de `budgeterLesSignalementsMasques()`. Le premier (« TCK-2590 — le numéro COMPLET
que la sonde compare à l'égalité… ») décrit `numeroComplet()`, plus bas dans le fichier, qui n'a aucun docblock.
PHP et les outils ne rattachent à une méthode que le docblock qui la précède immédiatement : celui-ci n'est rattaché à
rien.

Aucun changement de comportement.

## Contraintes strictes (métier)

- Le texte du docblock ne change pas : il est déplacé, pas réécrit.
- Pint propre.

## Delta à produire

- [x] Le premier des deux docblocks passe au-dessus de `numeroComplet()`.

## Critères d'acceptation

- [x] AC1 — `(new ReflectionMethod(CustomerDuplicateDetector::class, 'numeroComplet'))->getDocComment()` contient
  « le numéro COMPLET que la sonde compare à l'égalité ».
- [x] AC2 — `getDocComment()` de `budgeterLesSignalementsMasques` commence par « TCK-2590 (décision 8 du porteur ;
  troisième porte » et ne contient pas « le numéro COMPLET que la sonde compare ».
- [x] AC3 — `git diff` du fichier ne touche que des lignes de commentaire.

## Hors périmètre

- Toute réécriture des docblocks ou du code du détecteur.

## Notes d'implémentation

- Bloc de 7 lignes coupé au-dessus de `budgeterLesSignalementsMasques()` et collé tel quel au-dessus de
  `numeroComplet()` ; aucun autre octet du fichier ne change.
- Le texte déplacé reste juste : le limiteur `customer-duplicate-probe-full-number` (`AppServiceProvider`) ne compte que
  la sonde au numéro complet ; l'e-mail complet d'une fiche masquée puise dans le même seau par
  `budgeterLesSignalementsMasques()`, que son propre docblock décrit déjà.
- Preuves (2026-11-14) : AC1 et AC2 par `php -r` sur `ReflectionMethod::getDocComment()` (trois `true`) ; AC3 par
  `git diff -U0` dont toutes les lignes `+`/`-` sont `/**`, `*` ou `*/` ; Pint `passed` ; `SignalementMasqueTroisiemePorteTest`,
  `CustomerDuplicateProbeTest`, `CreationFicheSousVerrouTest`, `ContactLeadConvertTest`, `CustomerPhoneAndDuplicateTest` :
  51 verts.
