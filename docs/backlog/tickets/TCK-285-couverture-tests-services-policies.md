---
id: TCK-285
title: "Couverture de tests — services metier, policies, observers, webhooks"
status: todo
phase: P1
family: technique
estimate: L
wave: null
created: 2026-08-12
updated: 2026-08-12
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, tests, qualite]
---

## Objectif utilisateur

Qu'une régression sur le cœur métier ou sur l'isolation multi-agence soit attrapée par la CI, et
non par un utilisateur.

## Contrat de données

Aucun changement de données. Uniquement des tests.

## Contraintes strictes (métier)

Mesuré le 2026-08-12 sur 2052 tests verts — la suite est massive, mais très inégale :

| Couche | Trou mesuré |
|---|---|
| Services | **81 des 148** ne sont jamais nommés dans `tests/` ; 28 seulement ont un test dédié. Dont `BookingService`, `PropertyService`, `LeasePaymentService`, `InvoiceService`, `PayoutService`, `InventoryService`. |
| Policies | **12 des 16** ne sont jamais nommées. Dont `LeasePolicy`, `ConversationPolicy`, `InvitationPolicy`, `BankStatementPolicy`, `RoleDelegationPolicy`, `PropertyModerationPolicy`. |
| Observers / Jobs / Commandes | **10/12**, **9/30** et **13/14** jamais nommés. Les commandes non testées incluent des opérations **irréversibles** : `ExecuteScheduledAccountDeletions`, `PurgeOldWizardDrafts`, `MediaCleanup`. |
| Routes | **78 des 517** n'ont aucun littéral d'URI dans `tests/`, concentrées sur la console super-admin (20 routes `/api/admin`) et **les 5 webhooks entrants** (paiements, statuts SMS Orange/Mtarget/LAfricaMobile, statut WhatsApp). |

**L'ordre de priorité n'est pas le volume, c'est le coût d'un défaut :**

1. **Les policies** — l'agence est la frontière d'isolation ([ADR-0002](../../adr/0002-role-est-un-profil-polymorphe.md)). Un défaut y est invisible et fuit des données entre tenants.
2. **Les webhooks** — surfaces d'entrée **non authentifiées**, pilotées par un tiers. C'est le pire endroit où ne pas avoir de test.
3. **Les commandes destructrices** — un défaut y est irréversible par définition.
4. Le reste des services.

## Delta à produire

- [ ] Un test par policy non couverte, avec **au moins un cas d'agence tierce refusée** — sans lui, on ne distingue pas une policy juste d'une policy trop permissive.
- [ ] Un test par webhook : signature invalide → refus ; rejeu du même événement → idempotent.
- [ ] Un test par commande destructrice, sur le cas « rien à faire » **et** sur le cas nominal.
- [ ] Les six services du cœur métier nommés ci-dessus.

## Critères d'acceptation

- [ ] AC1 — les 16 policies sont nommées dans `tests/`, chacune avec un cas passant **et** un cas refusé.
- [ ] AC2 — les 5 routes `/api/webhooks` ont un test de signature invalide et un test de rejeu.
- [ ] AC3 — chaque nouveau test est **prouvé par mutation** : le casser doit faire rougir le test, et la mutation est notée dans le ticket.

## Hors périmètre

- La mesure de couverture globale et son seuil (`coverage: none` en CI aujourd'hui) — ticket distinct.

## Notes d'implémentation

Trou relevé par l'audit du 2026-08-12 (ardoise D-26 à D-29). Le nombre de tests verts n'a jamais dit
la couverture : 2052 tests peuvent laisser 81 services muets.
