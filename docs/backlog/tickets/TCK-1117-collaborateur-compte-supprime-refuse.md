---
id: TCK-1117
title: "Un compte supprimé ne s'ajoute plus comme collaborateur d'un bien : 422 sur `user_id`"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#8-propertycollaborator"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-96--règles-exists-sur-une-table-à-suppression-douce"
tags: [back, properties, collaborators, validation, pistes]
---

## Contexte

Réf : **P96.01** du fichier de pistes, `retenu · autonome` (A1 : le contrat est écrit dans
`CollaboratorEligibleForProperty` elle-même, « introuvable : leurs propres règles refusent déjà »,
et dans TCK-1097, seul le personnel joignable collabore).

`StorePropertyCollaboratorRequest` validait `user_id` par `exists:users,id`, qui ne voit pas
`deleted_at`, et la règle d'éligibilité, qui ne trouve pas un compte supprimé par `find()`, rendait
sans échec. Un compte supprimé en douceur devenait collaborateur (201, `"user": null`), sa part de
commission comptée par le plafond de 100 %.

## Objectif utilisateur

Le bailleur ou l'admin d'agence qui choisit un compte supprimé comme collaborateur reçoit une
erreur sur le champ, comme pour un identifiant inexistant, et aucune ligne n'est écrite.

## Delta à produire

- [x] `StorePropertyCollaboratorRequest` : `Rule::exists('users', 'id')->whereNull('deleted_at')`
      au lieu de `exists:users,id`.
- [x] Test `tests/Feature/Property/CollaboratorDeletedAccountTest.php`.

## Critères d'acceptation

- [x] AC1 — un agent de l'agence supprimé en douceur, ajouté en `agent` puis en `viewer` → 422 sur
      `user_id`, aucune ligne `property_collaborators`.
- [x] AC2 — même message d'erreur pour le compte supprimé que pour un identifiant absent.
- [x] AC3 — témoin : le même agent non supprimé s'ajoute (201).

## Hors périmètre

- Les collaborateurs déjà écrits vers un compte supprimé : aucune réécriture de données.
- Un rôle changé par `PUT` sur un collaborateur dont le compte a été supprimé depuis
  (`UpdatePropertyCollaboratorRequest`, même `find()` silencieux) : relevé, non traité.
- Les autres règles `exists:` sur une table à suppression douce (P96.02 à P96.04, au porteur).

## Notes d'implémentation

- Des deux options de la piste, la borne de `exists` est retenue : faire échouer la règle
  d'éligibilité sur un `find()` nul aurait ajouté une seconde erreur à un identifiant inexistant,
  que `exists:` refuse déjà (la règle n'est pas en `bail`).
- Ablation : la requête rendue à `HEAD` → 2 rouges sur 3 (201 au lieu de 422), le témoin reste
  vert ; correctif remis → 3/3.
