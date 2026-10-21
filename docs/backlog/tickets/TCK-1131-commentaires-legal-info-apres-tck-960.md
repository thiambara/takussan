---
id: TCK-1131
title: "Trois commentaires disent encore que le NINEA et les mentions légales vivent dans `metadata.legal_info`"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#2-agency"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-83--clés-des-colonnes-json-hors-agenciessettings"
tags: [back, front, agencies, docs, pistes]
---

## Contexte

Réf : **P83.05** du fichier de pistes, `retenu · autonome` (A6 : document qui contredit le code
mesuré).

Depuis TCK-959 (P47.01) la recherche globale cherche le NINEA dans la colonne `agencies.ninea`,
et depuis TCK-960 (P47.06) le passage en agence `standard` écrit les mentions légales dans les
colonnes d'`agencies`, jamais dans `metadata.legal_info`. Trois commentaires disaient encore
l'inverse : `AdminGlobalSearchService` (docblock de classe), `FlipAgencyKindOnUpgradeApproved`
(motif du journal sûr) et `takussan-web/src/types/agency.ts` (`AgencyMetadata`).

## Objectif utilisateur

Qui lit ces trois fichiers apprend où vivent réellement le NINEA et les mentions légales.

## Delta à produire

- [x] Docblock d'`AdminGlobalSearchService` : la colonne `agencies.ninea`, `legal_info` en repli.
- [x] Commentaire de `FlipAgencyKindOnUpgradeApproved` : le flip écrit les colonnes, NINEA
      compris, en clair ; la précaution du journal reste.
- [x] Docblock d'`AgencyMetadata` : `legal_info` n'est plus écrit par le flip.

## Critères d'acceptation

- [x] AC1 — aucun des trois commentaires ne dit que le flip écrit `metadata.legal_info`, ni que
      le NINEA se cherche dans `metadata.legal_info` seulement.

## Hors périmètre

- L'exposition de `legal_info` par `AgencyResource` (reste de P47.06).

## Reste à faire

lister les clés de `agencies.metadata` lues par le code (`welcome.standard_unlocked_at`, `slug_changed_at`, `legal_info` en repli) dans `docs/models-spec.md` § 2, sur le modèle de la table `users` : la spec est fermée à l'implémenteur

## Notes d'implémentation

- Commentaires seuls, sans changement de comportement : aucun test ne peut les garder, donc ni
  test ni ablation. Vérifié par relecture contre `AdminGlobalSearchService::byToken`
  (`where('ninea', …)` puis repli `metadata->'legal_info'`) et `AgencyKindFlipService::LEGAL_FIELDS`
  (« the flip writes only there »).
