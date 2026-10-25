---
id: TCK-2019
title: "Le membre suspendu ne lit, n'écrit ni ne liste plus les fils de bail et de bien de son agence"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: [TCK-2023]
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-191--fils-rattachés-à-un-bail-ou-à-un-bien-face-à-la-policy-de-leur-contexte"
tags: [api, messagerie, suspension, autorisation, pistes]
---

## Objectif utilisateur

Un agent (ou administrateur) suspendu dans une agence n'a plus accès aux fils de bail et de bien
de cette agence — ni lecture, ni écriture, ni liste, ni avis de message —, sans en être retiré :
réactivé, il les retrouve. Le bailleur et le locataire gardent leurs fils.

## Contexte

Réf : **P191.01** du fichier de pistes.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : version étroite : refuser le participant qui détient un profil non actif dans l'agence du contexte et n'est pas partie au bail ou au bien, dans `allows`, `branchesAllow` et `constrainListing` ; pas de `left_at`

## Hypothèses (mode sans humain)

- « Agence du contexte » : celle du bail (`leases.agency_id`) et celle du bien
  (`properties.agency_id`) d'un fil qui porte `lease_id` ou `property_id`, tous types de fil.
- « Détient un profil non actif » : un profil d'agent, d'administrateur ou de bailleur dans cette
  agence, et **aucun profil actif** dans la même agence. Un membre actif qui garderait par ailleurs
  un profil ancien n'est pas visé ; un membre retiré (profils supprimés) relève de TCK-1711 et de
  P191.02.
- « Partie au bail ou au bien » : le bailleur du bail, son locataire (`customers.user_id` du
  `tenant_id`), ou le propriétaire du bien (`properties.user_id`).
- `NotifyNewMessageJob` filtre par `branchesAllow` : la branche y entre, et le suspendu ne reçoit
  plus l'avis.

## Delta à produire

- [x] `ConversationAccess::contextAllows()`, appelée par `branchesAllow()` (donc par `allows()`).
- [x] `ConversationAccess::constrainListing()` écarte les mêmes fils, sans toucher la requête quand
  l'utilisateur n'a aucune agence où il n'est plus actif.
- [x] Garde : `tests/Feature/Messaging/MembreSuspenduFilsDeContexteTest.php`.

## Critères d'acceptation

- [x] AC1 — Agent suspendu par `TeamMemberSuspensionService::suspend` → pour le groupe de bail et le
  groupe de bien : `allows` et `branchesAllow` faux, `GET` et `POST …/messages` en 403, fils absents
  de `GET /api/conversations`, `left_at` nul ; le locataire garde le fil.
- [x] AC2 — Réactivé → les deux fils lui reviennent.
- [x] AC3 — Le bailleur suspendu reste partie au bail et au bien : il garde ses fils.

## Hors périmètre

- La branche « contexte » large (juger `LeasePolicy::view` / `PropertyPolicy::view`) : le porteur a
  retenu la version étroite.

## Notes d'implémentation

- Reproduit sur `c7f6c4101` : `allows` restait vrai après la suspension (« Failed asserting that
  true is false »).
- Ablation : branche retirée de `branchesAllow` et de la liste → rouge ; liste seule remise → le
  fil reparaît dans `GET /api/conversations`, rouge ; clause « partie » retirée → le bailleur
  suspendu perd ses fils, rouge. Rétabli → vert.
- Les tables `leases` et `properties` sont lues par `DB::table`, pour qu'un bail ou un bien
  supprimé (soft delete) garde son agence dans le jugement.
