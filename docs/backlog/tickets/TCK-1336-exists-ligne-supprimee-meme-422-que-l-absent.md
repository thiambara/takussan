---
id: TCK-1336
title: "Une ligne supprimée en douceur rend 422 sur le champ, comme un identifiant absent"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-96--règles-exists-sur-une-table-à-suppression-douce"
tags: [api, validation, suppression-douce, pistes]
---

## Contexte

Réf : **P96.02** du fichier de pistes, `validé`.

Six FormRequests acceptent par `exists:` une ligne supprimée en douceur, que le contrôleur ou le
service relit ensuite par `findOrFail()` sous la portée `SoftDeletes` : 404 `http.not_found` au
lieu d'une erreur sur le champ, et une réponse qui distingue « supprimé » (404) d'« inexistant »
(422).

## Décision du porteur

« validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V1.

## Choix de l'implémenteur

- La `Piste` propose `whereNull('deleted_at')` « ou `->withoutTrashed()`, à vérifier sous
  Laravel 13 ». Retenu : `Rule::exists(...)->withoutTrashed()`, présent sous Laravel 13
  (`Illuminate\Validation\Rules\DatabaseRule::withoutTrashed`, lu) et qui écrit le même
  `whereNull('deleted_at')`.
- Les reversements (`StorePayoutRequest`, `PreparePayoutRequest`) ne sont pas touchés : la `Piste`
  laisse elle-même le cas du bailleur effacé « à trancher à part ». C'est le reste de l'entrée.

## Delta à produire

- [x] `withoutTrashed()` sur : `StoreInvoiceRequest.customer_id`,
      `AssignAgentPropertyRequest.user_id`, `StoreAgentAbsenceRequest.user_id` et `substitute_id`,
      `StoreRoleDelegationRequest.user_id`, `AttachGuarantorLeaseRequest.guarantor_id`,
      `AddAgentAgencyRequest.user_id`.
- [x] Test `ExistsLigneSupprimeeTest` : par chemin, ligne supprimée et identifiant absent → même
      422 sur le même champ.

## Critères d'acceptation

- [x] AC1 — Les sept champs : ligne supprimée → 422 sur le champ (404 avant).
- [x] AC2 — Les mêmes : identifiant absent → 422 sur le même champ (inchangé).

## Reste à faire

Le bailleur effacé d'un reversement (`POST /api/payouts`, `GET /api/payouts/preparation`) : le
refuser décide si un reversement dû à un compte effacé reste réglable ; à trancher par le porteur.

## Hors périmètre

- Les `exists:` d'agence écrits par le super-admin (P96.03, même lot) et la garde d'architecture
  (P96.04).

## Notes d'implémentation

- Ablation : les six requêtes remises à `HEAD` → 7 rouges (404) ; patch remis → 7/7 verts.
