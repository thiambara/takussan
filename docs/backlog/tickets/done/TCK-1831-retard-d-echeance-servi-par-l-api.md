---
id: TCK-1831
title: "Retard d'une échéance de loyer servi par l'API (`is_overdue`), lu par l'échéancier"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-183--statuts-recalculés-par-le-navigateur-à-partir-des-dates"
tags: [api, front, leases, payments, pistes]
---

## Contexte

Réf : **P183.01** du fichier de pistes, `validé (délégué)` (V7 accordé).

`displayStatus` de `LeaseSchedule` passait « En retard » toute échéance `pending` dès
`new Date(due_date) < new Date()`. `due_date` arrive en `Y-m-d`, que `new Date()` lit à minuit
UTC : l'échéance était « En retard » dès 00 h 00 UTC le jour même, alors que l'API ne la tient pour
échue qu'au lendemain (`scopeOverdue` : `due_date < today` ; accueil du locataire et relances à
J+1). `docs/features.md` : « Impayé = échéance échue non payée » (TCK-595), et une restitution de
caution n'est jamais présentée comme une échéance à payer.

## Décision du porteur (déléguée)

l'API sert `is_overdue` sur `LeasePaymentResource`, calculé une fois avec la règle de `scopeOverdue` (`late`, ou `pending`/`partially_paid` dont `due_date` < aujourd'hui), toujours faux pour une restitution `deposit_refund`, et `displayStatus` de `LeaseSchedule` lit ce champ au lieu de comparer `new Date(due_date)` à l'instant ; pas de comparaison littérale au front. Garde : un test de `LeaseSchedule` à horloge figée sur une échéance du jour, attendue « En attente », et un test de ressource sur l'échéance du jour, de la veille et une restitution échue

## Delta à produire

- [x] `LeasePayment::isOverdue()` : la règle de `scopeOverdue` sur une ligne chargée (`late`, ou
      `pending`/`partially_paid` dû avant aujourd'hui), toujours faux pour une `deposit_refund`.
- [x] `LeasePaymentResource` sert `is_overdue`.
- [x] Type `LeasePayment` du front : `is_overdue: boolean` ; `LEASE_PAYMENT_FIELDS` le nomme.
- [x] `displayStatus` : une échéance `pending` est « En retard » si `is_overdue`, sans comparer
      de date au navigateur.
- [x] Tests : `LeasePaymentResourceContractTest` (clé au contrat ; échéance du jour, de la veille,
      du lendemain, `partially_paid` échue, payée, annulée, restitution `pending` et `late` échues),
      `LeaseSchedule.test.tsx` (horloge figée au 2026-10-23T09:00Z, échéance du jour « En attente »).

## Critères d'acceptation

- [x] AC1 — Une échéance `pending` due aujourd'hui s'affiche « En attente » dans l'échéancier, à
      toute heure UTC.
- [x] AC2 — `is_overdue` est vrai pour une échéance `pending` ou `partially_paid` due la veille,
      et pour une `late` ; faux pour l'échéance du jour et pour une restitution de caution, même
      échue ou `late`.

## Hypothèses

- Une `partially_paid` échue garde son libellé « Partiellement payé » dans l'échéancier : la
  décision porte sur la comparaison de dates des `pending`, pas sur les autres libellés.
- Une `deposit_refund` au statut `late` (aucun écrivain connu) garde l'affichage de son statut ;
  seul `is_overdue` la dit non échue.

## Notes d'implémentation

- Ablations API : branche restitution retirée → la restitution `late` rendue `is_overdue` vrai,
  1 rouge ; `<` remplacé par `<=` → l'échéance du jour rendue vraie, 1 rouge ; remis → 9/9.
- Ablation front : l'ancienne comparaison `new Date(due_date) < new Date()` remise → « échéance du
  jour » rouge ; remis → 31/31.
