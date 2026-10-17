---
id: TCK-808
title: "La pièce d'identité, le contact d'urgence, les notes et `metadata` d'un client ne sortent que vers le lecteur de sa fiche"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#7-customer
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-23--lectures-de-données-personnelles-sans-step-up-face-à-refused_reads
tags: [back, api, crm, rgpd, ressources, pistes]
---

## Contexte

Réf : **P23.02** du fichier de pistes, `validé` (critère du dernier classement accordé : V3).
`CustomerResource` est imbriquée dans le bail (`tenant`) et la réservation (`customer`). Le bailleur,
à qui `CustomerPolicy::view` refuse la fiche depuis TCK-587, y lisait la pièce d'identité et le
contact d'urgence de son locataire. Verif-591 m2 avait fermé la même voie pour les seuls critères de
recherche (`readsCriteria()`).

**Décision du porteur** (recopiée mot pour mot) :

> id_type, id_number, emergency_contact_*, notes et metadata réservés au lecteur qu'admet CustomerPolicy::view, même forme que readsCriteria()

**Hypothèse notée (mode sans humain)** : le locataire qui lit son propre bail n'est pas admis par
`CustomerPolicy::view` (ni auteur, ni personnel) : il ne lit plus ces champs de sa propre fiche par
le bail. Aucun écran du front ne les y affiche (lu : `grep id_number|emergency_contact` sous
`takussan-web/src/components` → formulaire client, fil d'activité du CRM et garants seulement).

## Objectif

Un lecteur qui n'a pas accès à la fiche client n'en reçoit ni la pièce, ni le contact d'urgence,
ni les notes, ni `metadata`, par quelque ressource qui l'imbrique.

## Delta à produire

- [x] `CustomerResource::readsCustomer()` : `CustomerPolicy::view`, mémorisée par requête et par
  couple (agence de la fiche, auteur ou tiers), les seuls traits de la fiche que la règle lit.
- [x] `id_type`, `id_number`, `emergency_contact_name`, `emergency_contact_phone`, `notes` et
  `metadata` étalés sous cette condition, comme les critères.
- [x] Test : `CustomerScopeTest::test_identity_contact_notes_and_metadata_are_rendered_to_the_customer_reader_only`.

## Critères d'acceptation

- [x] AC1 — le bailleur ne reçoit aucun des six champs par `GET /api/leases/{id}`,
  `GET /api/leases?include=tenant` ni `GET /api/bookings/{id}`, et reçoit encore le nom.
- [x] AC2 — le lecteur de la fiche (l'agent qui l'a ajoutée) les reçoit par la fiche et par le bail.

## Hors périmètre

- Le chiffrement et le masquage de `customers.id_number` (P23.03, ADR-0044).
- `email` et `phone` du locataire, que la décision ne vise pas.

## Notes d'implémentation

- Ablation : `CustomerResource` revenue à `pre-dev`, le test neuf rougit (`id_type` rendu au
  bailleur par le bail), les 6 autres de la classe restent verts ; correctif remis, 7 verts.
- La mémoire par couple n'est exacte que tant que `CustomerPolicy::view` ne lit de la fiche que
  `agency_id` et `added_by_id` (relu : `isAuthorStillMember`, `seesWholeCrm`, et la Gate de
  capacité qui dérive l'agence de `agency_id`).
- Une fiche chargée sans `agency_id` ni `added_by_id` (`fields[customers]` restreint) est jugée
  sur des valeurs nulles : la policy refuse, les champs ne sortent pas.
