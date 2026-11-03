---
id: TCK-2196
title: "Facture, reversement et réservation : la branche d'auteur exige que l'auteur soit encore membre de l'agence"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-218--ce-que-le-retrait-éteint-et-que-la-suspension-laisse--délégations-de-rôle-et-colonnes-dauteur"
tags: [api, autorisation, invoices, payouts, bookings, pistes]
---

## Objectif

L'émetteur d'une facture ou d'un reversement, et le créateur d'une réservation, n'y entrent plus par
leur seule signature : la ligne doit être sans agence, ou l'auteur encore membre de son agence. Les
trois listes suivent la même règle.

## Contexte

Réf : **P218.03** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-24) : ADR-0031, amendement du 2026-10-24 : la branche d'auteur vaut si la ligne est sans agence ou si l'auteur est encore membre (`isMemberAt`), précédent `CustomerPolicy::isAuthorStillMember` ; la liste par `memberAgencyIds` ; `DocumentPolicy` hors de ce ticket, reprise par P218.06 ; le bailleur bloqué perd la lecture d'une facture qu'il a émise

- `view` admettait `issued_by_id` (facture, reversement) et `created_by_id` (réservation) sans
  statut ni appartenance, et les listes avaient la même clause : l'agent suspendu ou retiré lisait
  et listait ce qu'il avait émis.

## Hypothèses (mode sans humain)

- La règle s'écrit une fois, `BasePolicy::auteurEncoreMembre`, et sert les trois policies ; P218.04
  (même règle d'auteur) la reprend.
- `InvoicePolicy::update` porte la même branche d'émetteur que `view` : elle suit la règle.
  `PayoutPolicy::update` exige déjà que l'émetteur soit du personnel ; inchangé.
- Le client du tunnel public garde sa réservation par la branche du client (`customer.user_id`),
  que `BookingService::create` résout pour lui.

## Delta à produire

- [x] `BasePolicy::auteurEncoreMembre` ; `InvoicePolicy::view`/`update`, `PayoutPolicy::view`,
  `BookingPolicy::view`.
- [x] Listes : `InvoiceController`, `PayoutController`, `BookingController::index` par
  `memberAgencyIds`.
- [x] `AuteurEncoreMembreTest` ; `MigratedAuthorizationRulesTest` : l'auteur de ses deux cas devient
  bailleur actif de l'agence (la règle qu'il épinglait change par la décision).

## Critères d'acceptation

- [x] AC1 — Agent auteur suspendu, puis retiré : `GET` de la facture, du reversement et de la
  réservation → 403, et chacune absente de sa liste.
- [x] AC2 — Bailleur bloqué émetteur d'une facture → 403.
- [x] AC3 — Témoins : auteur actif → 200 et listé ; facture sans agence → 200 pour son émetteur.

## Hors périmètre

- `DocumentPolicy` (P218.06).
- La lecture par délégation d'un délégué suspendu (P218.01).

## Notes d'implémentation

- Avant correctif : 200 et listé pour l'auteur suspendu et pour l'auteur retiré, 200 pour le
  bailleur bloqué.
- Ablation (policies et listes remises) → 3 rouges sur 5 ; remise → 5 verts.
- Piège : `MigratedAuthorizationRulesTest` prenait pour émetteur et créateur un compte sans aucun
  profil dans l'agence ; il épinglait exactement la règle que la décision retire.
