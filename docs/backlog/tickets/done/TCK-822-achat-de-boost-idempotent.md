---
id: TCK-822
title: "Boost : un achat rejoué avec la même clé d'idempotence ne débite qu'une fois"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#93-propertyboost-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-24--crédits-et-boost--idempotence-des-achats-remboursements-ce-que-voit-lespace"
tags: [back, front, credits, boost, pistes]
---

## Contexte

Réf : **P24.01** du fichier de pistes, `validé` (V1 accordé).

`POST /api/properties/{property}/boosts` ne recevait aucune clé d'idempotence. Un même achat
rejoué (réponse perdue, puis « Confirmer » de nouveau) était écrit et débité deux fois : deux
badges identiques coûtaient deux fois le prix pour un seul badge actif (le second remplace le
premier sans remboursement, ADR-0061 § 5), et une Vedette était prolongée deux fois.

## Décision du porteur

validé — en-tête Idempotency-Key généré à l'ouverture du dialogue, unique par espace sur 24 h, rejoué en 200 avec le boost déjà écrit

## Objectif utilisateur

Confirmer de nouveau un achat dont la réponse s'est perdue ne débite pas l'espace une seconde fois.

## Contraintes strictes

- La clé se lit et s'écrit **sous le verrou de l'espace**, dans la transaction de l'achat : deux
  rejeux simultanés se sérialisent.
- Aucune migration (V4 non accordé) : la clé vit dans le cache applicatif (`redis` en
  préproduction et en production, `docs/infra/prod-drivers.json`), avec une durée de 24 h.

## Hypothèses (mode sans humain)

- **La clé est complétée par l'offre côté front** : le dialogue génère un UUID à son ouverture et
  envoie `<uuid>-<id de l'offre>`. Choisir une autre offre dans le même dialogue est un autre achat ;
  sous la même clé, l'API le refuserait.
- **La même clé pour un autre bien ou une autre offre est refusée en 422**
  (`boost.idempotency_key_reused`), sans débit : elle ne désigne pas le même achat. Texte en `fr` et
  `en` ; en `wo`, le texte français tel quel (wolof en pause depuis le 2026-10-16).
- **L'en-tête reste facultatif** : sans lui, l'achat se comporte comme avant.

## Delta à produire

- [x] `BoostPurchaseService::purchaseOnce()` : rejoue sous le verrou l'achat déjà fait par la clé,
      et pose la clé (24 h) avant le COMMIT ; `purchase()` lui délègue sans clé.
- [x] `BoostPurchaseResult` : le boost, et s'il est rejoué.
- [x] `StorePropertyBoostRequest::idempotencyKey()`, et `PropertyBoostController::store()` rend
      200 sur un rejeu, 201 sinon.
- [x] Front : `useBuyBoost(propertyId, cleIdempotence)` envoie l'en-tête ; `BoostDialog` génère la
      clé à l'ouverture et la renouvelle à la fermeture.
- [x] `tests/Feature/Boost/BoostPurchaseIdempotencyTest.php`, `components/boost/__tests__/api.test.ts`,
      un cas de plus dans `BoostDialog.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Un badge acheté puis rejoué 30 s plus tard avec la même clé : 201 puis 200, même `id`,
      un seul débit, une seule ligne `property_boosts`.
- [x] AC2 — Une Vedette rejouée n'est ni débitée ni prolongée une seconde fois.
- [x] AC3 — Deux clés distinctes font deux achats.
- [x] AC4 — La même clé pour une autre offre, ou un autre bien de l'espace : 422
      `boost.idempotency_key_reused`, sans débit.
- [x] AC5 — Après 25 h, la même clé fait un nouvel achat.
- [x] AC6 — Le dialogue garde la même clé tant qu'il est ouvert sur la même offre, et en change à
      chaque ouverture ; `useBuyBoost` l'envoie dans `Idempotency-Key`.

## Hors périmètre

- La règle des contrôles « bien public » et « offre active » hors du verrou : TCK-823 (P24.04).
- L'achat offert par la plateforme (`offerFeatured`) : il ne débite rien.

## Notes d'implémentation

- **Ablation** : le rejeu court-circuité (`if (false && …)`), AC1, AC2 et les deux cas d'AC4
  rougissent, AC3 et AC5 restent verts (attendu) ; la durée portée à 30 jours, AC5 rougit. Front :
  sans l'en-tête, `api.test.ts` rougit ; sans le renouvellement à la fermeture, le cas du dialogue
  rougit. Tout remis, les 6 tests API et les 25 tests de `components/boost` sont verts.
- La clé est posée **avant** le COMMIT : posée après, un rejeu en attente du verrou passerait sans
  la voir. Si la transaction échoue ensuite, la clé désigne une ligne absente, et `replay()` l'ignore.
- Le boost d'une Vedette prolongée garde le `boost_product_id` de la première offre : la
  comparaison d'offre lit donc la valeur rangée avec la clé, jamais la ligne.
