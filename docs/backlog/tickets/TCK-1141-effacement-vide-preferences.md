---
id: TCK-1141
title: "L'effacement d'un compte vide ses préférences déclarées"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#leffacement-dun-compte-laisse-la-ville-et-les-intentions-déclarées-dans-userspreferences"
tags: [back, rgpd, pistes]
---

## Objectif utilisateur

Une personne dont le compte est effacé ne laisse pas, dans `users`, la ville et les intentions
de recherche qu'elle avait déclarées.

## Contexte

Réf : **P83.02** du fichier de pistes, `validé` (critère V3 accordé).

`AccountDeletionService::anonymize()` vidait `metadata` mais pas `preferences`, qui porte `city`,
`search_intent` et `entry_intent` (`UpdateMeRequest::PREFERENCE_FIELDS`). Mesuré avant correctif
(test de garde ci-dessous, `pre-dev` cdef5c26f) : `preferences` intact après `anonymize()`.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la voie que la `Piste` pose en premier, vider `preferences` dans `anonymize()`. La
« garde possible » (un test qui énumère les colonnes de `users`, chacune effacée ou déclarée
conservée) n'est pas faite : la liste « conservée, et pourquoi » est un choix que le mesureur
réservait au porteur.

## Hypothèses (mode sans humain)

- `timezone` et `preferred_language` restent : ni la piste ni sa validation ne les visent, et
  seuls ils n'identifient personne.

## Delta à produire

- [x] `anonymize()` : `'preferences' => null` dans le `forceFill`.
- [x] Test `AccountDeletionExecuteTest::test_l_effacement_vide_les_preferences_declarees`.

## Critères d'acceptation

- [x] AC1 — un compte aux `preferences` `{city, search_intent, entry_intent}`, puis `anonymize()`
  → `preferences` nul en base.

## Hors périmètre

- La garde qui énumère les colonnes de `users` (reste, voir le fichier de pistes).

## Notes d'implémentation

- Ablation : la ligne retirée → 1 rouge ; remise → la classe entière 17/17.
