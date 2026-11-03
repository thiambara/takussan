---
id: TCK-2195
title: "Réactiver un compte et réintégrer une agence n'écrivent, ne journalisent et ne préviennent qu'une fois"
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-211--gestes-décriture-qui-jugent-le-statut-sur-le-modèle-lié-hors-verrou"
tags: [back, admin, moderation, concurrence, pistes]
---

## Objectif utilisateur

Deux opérateurs qui lèvent ensemble la même sanction (ou un double clic) ne laissent qu'une ligne
de journal, et le compte ou les administrateurs de l'agence ne reçoivent qu'un avis.

## Contexte

Réf : **P211.07** du fichier de pistes, `validé`.

Décision du porteur : validation du porteur (2026-10-24) : mise à jour conditionnelle (`where status = blocked` ou `suspended`) en transaction pour la réactivation et la réintégration ; journal et avis seulement si une ligne a changé ; la partie KYC est retirée, `verify` exigeant déjà `submitted` sous verrou

Avant (lu, puis mesuré par `LeveeDeSanctionConditionnelleTest`) :
`UserLifecycleController::reactivate` et `AgencyModerationController::reinstate` jugent le statut
sur le modèle lié à la route, puis écrivent, journalisent et préviennent hors transaction : la
ligne passée `active` juste après le chargement → 200, journal et avis.

## Hypothèses (mode sans humain)

- **La condition se juge en base, l'écriture passe par le modèle.** Un `update()` par requête
  sauterait `AgencyObserver` (réindexation des biens à l'entrée dans `active`, TCK-600) et le
  journal du statut de `User` (`getActivitylogOptions`). La ligne est donc lue
  `where status = blocked|suspended` sous `lockForUpdate`, dans la transaction, puis écrite par
  `save()`.
- Rien n'a changé → 422 `user.not_blocked` ou `agency.not_suspended`, comme un second appel
  séquentiel aujourd'hui. Le journal s'écrit dans la transaction ; l'avis part après.

## Delta à produire

- [x] `reactivate` : ligne `blocked` relue sous verrou en transaction, écrite et journalisée ; avis
  seulement si elle a changé.
- [x] `reinstate` : ligne `suspended` relue sous verrou en transaction, passée par `transition()` ;
  avis seulement si elle a changé.
- [x] Test : `tests/Feature/Admin/Platform/LeveeDeSanctionConditionnelleTest.php`.

## Critères d'acceptation

- [x] AC1 — Compte passé `active` en base après le chargement par la route → 422 `user.not_blocked`,
  aucun journal `super_admin_user_reactivated`, aucun avis.
- [x] AC2 — Agence passée `active` en base après le chargement → 422 `agency.not_suspended`, aucun
  journal `super_admin_agency_reinstated`, aucun avis.
- [x] AC3 — Le cas ordinaire écrit, journalise une fois et prévient.

## Hors périmètre

- `kyc:expire-dossiers` : la partie KYC est retirée par la décision.

## Notes d'implémentation

- **Ablation** : les deux contrôleurs remis à `HEAD` → 2 rouges sur 3 ; correctif remis → 3 verts.
