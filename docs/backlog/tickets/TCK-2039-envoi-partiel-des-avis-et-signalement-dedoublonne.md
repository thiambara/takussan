---
id: TCK-2039
title: "Le formulaire d'invitation dit quels avis sont partis avant l'erreur ; le dédoublonnage du signalement est écrit comme voulu"
status: done
phase: P2
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
  models:
    - "docs/models-spec.md#11-review"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-201--gestes-à-usage-unique-jugés-par-une-lecture-déligibilité-faite-au-montage"
tags: [front, api, avis, signalement, i18n, pistes]
---

## Objectif utilisateur

Le client qui note plusieurs cibles d'un même bail sait, quand un dépôt échoue, lesquelles sont
déjà enregistrées.

## Contexte

Réf : **P201.04** du fichier de pistes.

## Décision du porteur (déléguée)

> validé (délégué) — dans `ProfileReviewsList`, quand un dépôt échoue après d'autres, afficher avec l'erreur les cibles déjà enregistrées (clé neuve fr/en, wo : le français tel quel) ; pour le signalement, garder le dédoublonnage tel quel et l'écrire comme voulu en commentaire de `PublicPropertyController::report` et de `ReviewReportService`, avec renvoi à ADR-0043 § 6, sans fusionner le second envoi

## Hypothèses (mode sans humain)

- Texte de la clé neuve `profile.reviews.opportunityPartiallySent` : « Déjà enregistré : {targets}. »
  (en : « Already saved: {targets}. ») ; `wo` porte le français tel quel. Chaque cible est nommée
  comme sa légende (« Le bien · Villa Ngor »), jointes par une virgule.

## Delta à produire

- [x] `ProfileReviewsList` (`OpportunityForm`) : les cibles déposées avant l'échec s'affichent sous
  l'erreur, dans la même zone `role="alert"`.
- [x] Clé `opportunityPartiallySent` en `fr`, `en`, `wo`.
- [x] Commentaires dans `PublicPropertyController::report` et `ReviewReportService::report`.
- [x] Garde : `ProfileReviewsList.envoi-partiel.test.tsx`.

## Critères d'acceptation

- [x] AC1 — bien déposé puis agent refusé : l'alerte porte l'erreur et « Déjà enregistré : Le bien ·
  Villa Ngor. », sans l'agent.
- [x] AC2 — échec au premier dépôt : l'erreur seule.

## Hors périmètre

- Fusionner le second signalement (écarté par la décision).

## Notes d'implémentation

- Ablation : composant remis → 1 rouge sur 2 (l'alerte ne porte que l'erreur) ; rétabli → vert,
  `ProfileReviewsList.test.tsx` et `.filtres-url.test.tsx` verts.
