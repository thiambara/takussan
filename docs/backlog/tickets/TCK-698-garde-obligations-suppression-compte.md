---
id: TCK-698
title: "Chaque obligation qui bloque la suppression d'un compte a son test de bout en bout"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#56-accountdeletionrequest-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-12--tests--zones-non-gardées-tests-verts-sans-leur-code
tags: [api, account, rgpd, tests, pistes]
---

## Contexte

Réf : **P12.02** du fichier de pistes, `retenu · autonome` (classement A5 : garde ajoutée, sans
toucher au code ni à un seuil).

`AccountDeletionService::collectOpenObligations()` refuse la demande de suppression d'un compte
qui doit encore quelque chose : bail actif, loyer en attente, facture due, réservation ouverte.
Seul le bail actif est testé. `test_blocked_when_user_has_pending_lease_payment_via_customer` ne
crée qu'un bail actif (« The active lease alone is enough »). Neutraliser les trois autres requêtes
laisse la classe verte (reproduit le 2026-10-16) : un ancien locataire débiteur pourrait effacer
son compte sans qu'aucun test ne rougisse.

## Objectif

Le test échoue dès que l'une des trois obligations non gardées cesse de bloquer la demande.

## Delta à produire

- [x] `AccountDeletionRequestTest` : un test par obligation, sur `POST /api/auth/me/deletion-request`,
      avec un bail **résilié** pour que le bail lui-même ne bloque rien :
      - échéance de loyer en retard (`late`) ;
      - facture `overdue`, à côté d'une facture payée ;
      - réservation `confirmed` créée par le compte, à côté d'une réservation annulée.
      Chacun asserte la liste exacte des obligations rendues (`type`, `id`) et que
      `deletion_requested_at` reste nul.
- [x] Un témoin : les mêmes obligations soldées (loyer payé, facture payée, réservation terminée)
      laissent passer la demande (202).

## Critères d'acceptation

- [x] AC1 — Avec le code actuel, les quatre tests sont verts.
- [x] AC2 — Chaque requête neutralisée (`whereRaw('false')`) rend rouge son test, et lui seul.
- [x] AC3 — Le filtre de statut des factures retiré rend rouge le témoin.

## Hypothèses (mode sans humain)

- La restitution de caution en attente, qui ne doit pas bloquer (TCK-595 H-2), est déjà gardée par
  `DashboardTenantDepositRefundTest::test_h2_a_pending_deposit_refund_does_not_block_account_deletion`.
  Elle n'est pas dupliquée ici.

## Hors périmètre

- Le code de `collectOpenObligations()`, juste aujourd'hui.
- Les autres statuts bloquants (`pending`, `partially_paid`, facture `sent`, réservation `pending`) :
  un statut par requête suffit à garder la requête elle-même.

## Notes d'implémentation

- Ablation, une requête à la fois (`whereRaw('false')` ajouté) : loyers → seul
  `test_blocked_by_a_late_rent_on_a_terminated_lease` rouge ; factures → seul
  `test_blocked_by_an_unpaid_invoice` ; réservations → seul `test_blocked_by_an_open_booking`.
  Filtre de statut des factures retiré → le témoin et le test des factures rouges. Code remis :
  11 verts (43 assertions).
