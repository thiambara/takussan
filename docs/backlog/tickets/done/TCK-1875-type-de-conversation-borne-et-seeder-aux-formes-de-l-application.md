---
id: TCK-1875
title: "`POST /api/conversations` n'accepte que `direct` et `group`, et le seeder écrit les fils que l'application écrit"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-191--fils-rattachés-à-un-bail-ou-à-un-bien-face-à-la-policy-de-leur-contexte"
tags: [api, messagerie, seeders, pistes]
---

## Objectif

Une conversation ne s'ouvre plus avec un `type` que l'application n'écrit pas, et la base de
développement ne montre plus de fils d'une forme qu'aucun écrivain ne produit.

## Contexte

Réf : **P191.05** du fichier de pistes, `validé (délégué)`.

- `StoreConversationRequest` acceptait tout cas de `ConversationType` : `lease`, `booking`,
  `property` et `support` passaient sur le chemin de la directe et s'enregistraient tels quels
  (201). Aucun code de l'application n'écrit ces types ; le front ne les connaît pas.
- `ConversationSeeder` écrivait des fils `property` à `property_id` de deux à quatre participants :
  ni fil de prospect (`ConversationAccess::isProspectThread` exige `direct`), ni groupe.

## Décision du porteur (déléguée)

> borner `type` de `StoreConversationRequest` à `direct` et `group` (le second part déjà vers `storeGroup`), un autre cas → 422 ; faire écrire au `ConversationSeeder`, comme l'application, des directes de prospect (`direct`, `property_id`, deux participants, créateur prospect) et des groupes (`group`, trois participants ou plus, créateur administrateur) au lieu des fils `property` ; ni migration ni réécriture des fils déjà en base

## Hypothèses (mode sans humain)

- Le prospect semé est un client de l'agence qui a un compte (`customers.user_id`), et le second
  participant de sa directe est le contact principal du bien (`PrimaryPropertyContact`), comme
  `PropertyConversationResolver::firstOrCreate()`. Un seul fil par prospect et par bien ; un tirage
  qui retomberait sur un couple déjà semé donne un groupe.
- Les fils sans bien que le seeder écrivait (`direct` de deux à quatre participants) deviennent
  des groupes : l'application n'ouvre pas de directe entre membres d'une agence par ce chemin
  (aucun appelant au front, `StoreConversationRequest`).
- Un groupe compte son créateur (un agent, administrateur) et deux ou trois autres membres de
  l'agence ; une agence de moins de trois membres n'en reçoit pas.

## Delta à produire

- [x] `StoreConversationRequest` : `type` limité à `direct` et `group` (`Rule::enum(...)->only`).
- [x] `ConversationSeeder` : directes de prospect et groupes, au lieu des fils `property`.
- [x] Tests : `type` hors usage → 422 ; forme des fils semés.

## Critères d'acceptation

- [x] AC1 — `POST /api/conversations` avec `type` `lease`, `booking`, `property` ou `support` → 422
  sur `type`, aucun fil écrit ; la même requête en `direct` → 201.
- [x] AC2 — Le seeder n'écrit que des `direct` et des `group` ; chaque directe porte un bien, deux
  participants (le prospect créateur et le contact principal du bien) ; chaque groupe a un sujet,
  trois participants ou plus, et son créateur administrateur.

## Hors périmètre

- L'enum `ConversationType` garde ses six cas ; ni migration ni réécriture des fils déjà en base.
- Le type du front (`takussan-web/src/types/message.ts`, `direct | group | support`) n'est pas touché.

## Notes d'implémentation

- Ablation : la règle `only` retirée → `test_un_type_autre_que_directe_ou_groupe_est_refuse`
  rouge (201 au lieu de 422) ; le seeder rendu à son état d'avant → `ConversationSeederTest` rouge
  (types `direct` et `property`) ; correctifs remis → verts.
- Le témoin de `test_la_garde_de_la_directe_vaut_pour_tout_type_autre_que_groupe` attendait 201
  pour chaque type hors `group` : il ne vaut plus que pour `direct`, le refus des autres types
  ayant son propre test.
- `ConversationParticipant::role` est casté en `ParticipantRole` : l'assertion compare l'enum.
