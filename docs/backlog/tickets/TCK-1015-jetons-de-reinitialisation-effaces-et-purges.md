---
id: TCK-1015
title: "Les jetons de réinitialisation partent à l'effacement et sont purgés chaque jour"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-57--téléphones-et-e-mails-hors-de-users-face-à-lanonymisation"
tags: [api, rgpd, auth, scheduler, pistes]
---

## Contexte

Réf : **P57.03** du fichier de pistes, `validé` (V3). `password_reset_tokens` a l'e-mail pour
clé ; `anonymize()` n'y touche pas, et `auth:clear-resets` n'est pas planifiée : une ligne ne part
qu'à l'usage ou à une nouvelle demande. Re-mesuré le 2026-10-19 sur `pre-dev` 5cd62d286 par les
tests ci-dessous, avant correctif : la ligne de l'adresse d'origine survit à `executeDeletion()`,
et aucune entrée du planificateur ne cite `auth:clear-resets`.

## Décision du porteur

> supprimer à l'effacement les lignes de `password_reset_tokens` de l'adresse d'origine, relevée avant le `forceFill`, et planifier `auth:clear-resets` chaque jour dans `routes/console.php` ; deux tests (porteur, 2026-10-19)

## Objectif

Un compte effacé ne laisse pas son adresse dans `password_reset_tokens`, et une demande abandonnée
n'y reste pas indéfiniment.

## Delta à produire

- [x] `AccountDeletionService::anonymize()` : supprimer les lignes de l'adresse d'origine.
- [x] `routes/console.php` : `auth:clear-resets activations`, chaque jour.
- [x] `AccountDeletionExecuteTest::test_execute_supprime_le_jeton_de_reinitialisation_de_l_adresse_d_origine`.
- [x] `PasswordResetTokensPruneTest` : la commande est planifiée chaque jour, et la purge
      planifiée garde un lien d'activation de 2 jours tout en retirant une ligne de 8 jours.

## Critères d'acceptation

- [x] AC1 — Après `executeDeletion()`, aucune ligne pour l'adresse d'origine ; celle d'une autre
      adresse reste.
- [x] AC2 — Le planificateur porte `auth:clear-resets` une fois, chaque jour.
- [x] AC3 — La purge planifiée n'efface pas un lien d'activation encore valable (TCK-781).

## Hypothèses (mode sans humain)

- **Le broker `activations` est passé à la commande.** La table est partagée par deux brokers
  (lu, `config/auth.php`) : `users` expire en 60 minutes, `activations` (lien du gérant
  provisionné, TCK-781) en 7 jours. `auth:clear-resets` sans argument purge par le broker par
  défaut, `users` : `deleteExpired()` retire toute ligne de plus de 60 minutes (lu,
  `DatabaseTokenRepository`), liens d'activation compris, ce qui casserait TCK-781. Purger par
  `activations` retire les lignes de plus de 7 jours : un jeton de réinitialisation abandonné
  reste au plus 7 jours, au lieu de toujours. La décision « planifier `auth:clear-resets` chaque
  jour » est tenue ; le choix de l'argument est noté ici pour le porteur.

## Hors périmètre

- Une durée plus courte pour les seuls jetons de réinitialisation : elle demanderait de
  distinguer les deux brokers dans la table (colonne, donc migration).

## Notes d'implémentation

- Avant correctif : 3 rouges (ligne survivante, aucune entrée planifiée). Ablations, chacune
  rejouée sur les deux classes : effacement neutralisé → 1 rouge ; planification retirée →
  2 rouges ; `auth:clear-resets` sans broker → 2 rouges, dont la purge du lien d'activation de
  2 jours. Remis → 13 verts.
