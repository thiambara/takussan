---
id: TCK-2032
title: "Le « revenu 30 jours » de la santé d'agence suit la règle de l'Encaissé, sans lignes supprimées"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  adr:
    - "docs/adr/0057-instantanes-quotidiens-des-metriques-plateforme.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-198--un-même-mot-compté-par-des-règles-différentes-d-un-écran-à-l-autre"
tags: [api, console, reporting, argent, pistes]
---

## Objectif utilisateur

Le super-administrateur qui ouvre la santé d'une agence lit un « revenu 30 jours » et un nombre de
transactions qui disent la même chose que la tuile « Volume d'affaires (30 j) » de la console :
l'argent encaissé, sans les dépôts de garantie, sans les restitutions de caution (qui sortent vers
le locataire), les réservations nettes de leurs remboursements, et sans les lignes supprimées.

## Contexte

Réf : **P198.02** du fichier de pistes. `GET /api/admin/agencies/{agency}/health`
(`AgencyDetailController::health`) était un `DB::selectOne` brut qui sommait toute ligne payée
sans condition de `payment_type` ni `refund_amount`, et dont aucune sous-requête ne posait
`deleted_at IS NULL`.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : la piste telle qu'écrite (ADR-0057 § 2) ; `transactions_30d` suit le même périmètre que le revenu

## Hypothèses (mode sans humain)

- Le revenu des réservations reste rattaché à l'agence par le bien de la réservation, comme avant.
- `last_platform_payment_at` garde son sens (« dernier paiement reçu », tout type), mais écarte les
  lignes supprimées, comme la piste le relève.
- `open_complaints` n'est pas dans la piste : inchangé.

## Delta à produire

- [x] `health` lit `CollectedPayments::leaseIncome()` / `bookingIncome()`, sommés par
  `LEASE_NET_SQL` / `BOOKING_NET_SQL`, bornés par l'agence et `paid_at` ; `transactions_30d` compte
  les mêmes lignes.
- [x] Les comptes de biens, le revenu, les transactions et le dernier paiement passent par Eloquent
  (suppression douce des lignes lues) et les jointures écartent baux, réservations et biens
  supprimés.
- [x] Garde : `AgencyDetailTest::test_p198_02_revenu_30_jours_suit_la_regle_de_l_encaisse`.

## Critères d'acceptation

- [x] AC1 — un dépôt, une restitution, une échéance supprimée, une échéance d'un bail supprimé et un
  paiement de réservation supprimé, payés dans la fenêtre, ne changent ni le revenu ni le compte de
  transactions ; une réservation remboursée en partie compte pour son net.
- [x] AC2 — un bien supprimé n'est compté ni « actif » ni « en modération ».

## Hors périmètre

- Le libellé et l'affichage du front (`agency-detail.tsx`) : inchangés, la clé garde sa forme.

## Notes d'implémentation

- Reproduit sur `96d942893` : le test rendait `active_properties` 2 au lieu de 1, et `revenue_30d`
  630 000 au lieu de 175 000.
- Ablation : contrôleur remis → rouge (`2 is identical to 1`, puis `630000 is identical to
  175000`) ; rétabli → vert.
