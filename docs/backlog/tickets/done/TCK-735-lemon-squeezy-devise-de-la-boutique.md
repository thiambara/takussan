---
id: TCK-735
title: "Lemon Squeezy : refuser à l'initiation un payable dont la devise n'est pas celle de la boutique"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements"
tags: [back, payments, lemon-squeezy, currency, pistes]
---

## Contexte

Réf : **P04.07** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

`LemonSqueezyDriver::initiate()` ne lit pas `$currency` et passe le montant en `custom_price`, que
Lemon Squeezy compte dans la devise de la boutique. Un payable en EUR de 45,00 sur une boutique en
USD ouvrait un checkout de 45 USD.

## Décision du porteur

refus à l'initiation quand la devise du payable diffère de celle de la boutique

## Objectif utilisateur

Un payeur n'est jamais débité par carte dans une autre devise que celle de ce qu'il doit.

## Contrat de données

- Aucun endpoint neuf. `initiate()` du pilote lit la devise de la boutique par
  `GET https://api.lemonsqueezy.com/v1/stores/{store_id}` (attribut `data.attributes.currency`),
  avec la clé de l'intégration, avant de créer le checkout.
- Devise différente : 422 `payment.currency_unsupported` (code et textes existants, paramètres
  `provider`, `currency`).
- Boutique injoignable ou devise illisible : 502 `payment.provider_unavailable` (code existant).
- Aucun champ d'intégration neuf, aucune migration.

## Contraintes strictes (métier)

- Le refus a lieu avant toute création de checkout : rien n'est noté sur le paiement
  (`initiate()` du service tourne en transaction, le pilote lève avant `recordInitiation()`).
- **Hypothèse** : l'objet `Store` de l'API Lemon Squeezy porte la devise de la boutique en code
  ISO 4217 dans `attributes.currency` (documentation de l'API ; non re-mesuré, l'API est hors
  poste). Une réponse sans devise refuse au lieu de deviner.
- **Hypothèse** : lire la boutique par l'API plutôt qu'un champ « devise » saisi dans
  l'intégration, pour ne pas ajouter de champ visible ni rendre indisponibles les intégrations
  existantes. Coût : une requête de plus par initiation.
- Le journal ne garde jamais le message de l'exception du paquet (ADR-0044 §2).

## Delta à produire

- [x] `LemonSqueezyDriver::initiate()` : lecture de la devise de la boutique (`storeCurrency()`)
      et refus d'une devise différente.
- [x] Tests : `LemonSqueezyStoreCurrencyTest` (neuf, 3 cas) ; `PaymentAmountScaleTest` : sa
      fausse API rend une boutique en USD.

## Critères d'acceptation

- [x] AC1 — Payable en EUR, boutique en USD : 422 `payment.currency_unsupported`
      (`provider` = `lemon_squeezy`, `currency` = `EUR`), et aucun `POST /v1/checkouts`.
- [x] AC2 — Payable en EUR (casse quelconque), boutique en EUR : le checkout s'ouvre.
- [x] AC3 — Boutique sans devise lisible : 502 `payment.provider_unavailable`, aucun checkout.

## Hors périmètre

- `availableProviders()` propose encore Lemon Squeezy pour une devise que la boutique n'accepte
  pas : le refus arrive au clic. Le filtrer demanderait un appel à l'API à chaque liste.
- `extractFees()` mêle `total_usd` et des montants en devise de boutique, et suppose `USD` par
  défaut : la garde de sous-paiement est l'objet de P04.06 (TCK-734).

## Notes d'implémentation

- **Ablation** : sans la comparaison de devise dans `initiate()`, AC1 et AC3 rougissent (le
  checkout s'ouvre) et AC2 reste vert ; comparaison remise : 3 sur 3 verts.
- **Piège** : `PaymentDriverErrorLeakTest` fait échouer toute l'API ; c'est désormais la lecture
  de la boutique qui lève la première, sous le même message de journal
  (`[lemon-squeezy] checkout failed`), et le test reste vert sans changement.
