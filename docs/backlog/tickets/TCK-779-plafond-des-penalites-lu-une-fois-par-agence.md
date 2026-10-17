---
id: TCK-779
title: "Pénalités de retard : le plafond lu une fois par agence, et non à chaque échéance"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: [TCK-778]
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#30-setting-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes"
tags: [back, performance, penalites, settings, pistes]
---

## Contexte

Réf : **P02.13** du fichier de pistes, `validé` (critère accordé : V1). `ApplyLateFeesJob` boucle
par échéance sur `LateFeeCalculator::apply()`, qui appelle `compute()` puis `applyCap()` ; chaque
appel relit `late_fees.cap_percent` dans `settings` (`ScopedSetting::value()` depuis TCK-778), alors
que la valeur est constante pour une agence pendant le passage.

## Décision du porteur

le plafond des pénalités lu une fois par agence, même résultat

## Delta à produire

- [x] `LateFeeCalculator::capPercent()` garde la valeur lue par agence pour la durée de vie de
      l'instance : le job en résout une par passage.
- [x] Le résultat (montant de pénalité, plafond appliqué) ne change pas.

## Critères d'acceptation

- [x] AC1 — Un passage du job sur trois échéances d'une même agence à plafond d'agence ne lit la
      ligne `settings` de l'agence qu'une fois.
- [x] AC2 — Les pénalités écrites sont celles d'avant (plafonnées à la valeur de l'agence).

## Hors périmètre

- La valeur globale, déjà mise en cache par `PlatformSettingService` (10 min).
- Le requêtage des échéances par le job.

## Hypothèses (mode sans humain)

- « une fois par agence » est tenu par une mémoire d'instance dans le calculateur plutôt que par
  un paramètre passé depuis `applyForAgency` : le seul appelant hors des tests est le job, qui
  résout une instance par passage, et `apply()` garde sa signature.

## Notes d'implémentation

- Ablation : `LateFeeCalculator.php` remis à l'état de TCK-778 → le test neuf rougit (3 lectures
  de la ligne d'agence pour 3 échéances, au lieu de 1) ; correctif remis → vert, et les 10 classes
  qui citent le calculateur ou le job vertes (151 tests).
- Le test compte la requête de `ScopedSetting::agencyRow()` seule : la lecture globale passe par le
  cache de `PlatformSettingService`, hors du sujet.
