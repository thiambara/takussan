---
id: TCK-007
title: Conversion multi-devises avec taux (EF9)
status: blocked
phase: EF
family: evolution
estimate: M
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-017, TCK-028]
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#évolutions-futures
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#15-leasepayment-
tags: [back, i18n, payments, evolution]
---

## Contexte

Issu du warning `features.md §2.8 P3` (ligne 383), justifié par l'évolution
future **EF9** (models-spec.md lignes 1705–1711). **Bloqué par déclencheur produit.**

Déclencheur formel: première transaction réglée dans une devise différente de
celle du bail / de l'annonce (ex: bail XOF payé en EUR).

## Objectif

Ajouter un modèle `ExchangeRate` historisé pour permettre la conversion
automatique lors d'un paiement, avec traçabilité du taux appliqué sur toutes
les quittances et factures.

## Delta à produire (post-déblocage)

- [ ] Modèle `ExchangeRate(base_currency, target_currency, rate, valid_from, valid_to, source)`
- [ ] Commande `php artisan exchange-rates:refresh` (source: openexchangerates ou BCEAO)
- [ ] Colonnes sur `BookingPayment` / `LeasePayment` : `paid_amount_original`, `paid_currency`, `exchange_rate_id`, `converted_amount`
- [ ] Affichage sur quittances PDF : « X EUR (≡ Y XOF au taux du JJ/MM/AAAA, source: …) »
- [ ] Écran admin de saisie manuelle (fallback)

## Critères d'acceptation (à affiner au déblocage)

- [ ] Un paiement cross-devise génère un enregistrement `ExchangeRate` lié
- [ ] La quittance PDF affiche le taux appliqué et sa date
- [ ] La commande refresh est idempotente
- [ ] Une passe `/sync-specs` est lancée après merge

## Hors périmètre

- Trading / hedging
- Taux intraday
- Audit de change

## Notes d'implémentation

_(gelé en attente du déclencheur produit)_
