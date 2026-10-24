---
id: TCK-2027
title: "L'agent créateur d'un bien, suspendu ou retiré, ne lit plus les documents du bien ni du bail et n'en joint plus"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-190--créateur-dun-bien-dagence-suspendu-ou-retiré-face-aux-règles-qui-lacceptent-par-la-seule-identité"
tags: [api, documents, authorization, pistes]
---

## Contexte

Réf : **P190.05** du fichier de pistes, `validé` (V2 accordé). `DocumentPolicy::reaches` jugeait la
branche du bailleur par l'identité en lecture (`authorId === user.id`) et par `landlordWrites` en
écriture, qui ne refuse que le bailleur bloqué : l'agent qui a saisi le bien (`properties.user_id`,
recopié en `leases.landlord_id`), suspendu ou retiré, lisait les documents du bien et du bail et en
joignait de nouveaux.

## Décision du porteur

validation du porteur (2026-10-23) : la piste telle qu'écrite (`BailleurDuBien` pour les colonnes de bailleur, `landlordWrites` gardé pour les colonnes d'auteur)

## Hypothèses (mode sans humain)

- Toutes les colonnes que `reaches` passe à `$bailleur` sont des colonnes de bailleur
  (`properties.user_id` du bien, de la réservation et de l'état des lieux, `leases.landlord_id`) ;
  les colonnes d'auteur (`uploaded_by`, `conducted_by`, `created_by_id`, `added_by_id`) sont
  jugées hors de `$bailleur` et ne changent pas.

## Delta à produire

- [x] `DocumentPolicy::reaches` : `$bailleur` par `BailleurDuBien::est` en lecture, par
  `bailleurEcrit` en écriture.
- [x] Test `AgentCreateurDocumentsDuBienTest`.

## Critères d'acceptation

- [x] AC1 — agent créateur suspendu, puis retiré : `GET /api/documents/{id}` d'un document du bien
  et d'un document du bail en 403, `POST /api/documents` sur le bien en 404
  `document.owner_not_found`, aucun document créé.
- [x] AC2 — bailleur bloqué : lecture 200, rattachement refusé ; bailleur actif : lecture 200,
  rattachement 201 ; agent actif : lecture et rattachement au titre du personnel.

## Hors périmètre

- `update`, `share` et `delete` du document, jugés sur `uploaded_by` (colonne d'auteur) ou sur
  `porteur.user_id` par `landlordWrites` dans `share` : la piste ne vise que `reaches`.

## Notes d'implémentation

- Ablation : `DocumentPolicy` remis à l'état d'avant → 2 rouges (suspendu, retiré : `GET` 200), vert remis.
- `MigratedAuthorizationRulesTest::test_document_attach_to_covers_each_polymorphic_branch` désignait
  un quidam sans profil comme `user_id` d'un bien d'agence : sous la règle de `BailleurDuBien`, il
  n'en est plus bailleur. Le jeu lui donne le profil propriétaire de l'agence, l'assertion reste.
