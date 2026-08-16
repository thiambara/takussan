---
id: TCK-315
title: "Où vit le rôle d'agence d'un prestataire — le profil n'a pas d'agence, la collaboration si"
status: todo
phase: P1
family: technique
estimate: M
wave: 34
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-279]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#52-agencyrole--tck-279
    - docs/models-spec.md#règle-6--1-profil--1-rôle-personnalisé
tags: [back, rbac, adr, decision, securite]
---

## Objectif utilisateur

Qu'un prestataire qui travaille pour trois agences puisse avoir trois rôles différents — ou qu'il
soit écrit noir sur blanc qu'il n'en a qu'un, et pourquoi.

## ✅ Arbitrage rendu le 2026-08-16 — sortie **A**

**Le rôle vit sur la COLLABORATION** : `service_provider_agency_collaborations.agency_role_id`.
Décision produit prise le 2026-08-16, sur la lecture de la mesure ci-dessous.

Ce qu'elle acte : **un prestataire peut porter un rôle différent par agence**, et le multi-agence
n'était pas une erreur — la table de collaboration existe précisément pour ça. La Règle 6 devient
« 1 profil = 1 rôle **par agence** » pour ce seul type de profil, et cette exception doit être
**écrite** dans la Règle, pas déduite de l'absence de colonne.

**L'ADR reste requis avant la première ligne de code** : la décision est prise, sa *forme* et ses
conséquences sur la Règle 6 ne le sont pas encore. L'ADR n'est pas la décision, c'est l'endroit où
elle survit à ceux qui l'ont prise.

## Le constat qui a conduit à cet arbitrage

TCK-279 a posé `agency_role_id` sur **trois** tables de profils sur quatre. La quatrième a été
**refusée à la mesure, pas oubliée** — et le refus est le bon geste : poser le pointeur là aurait
créé une donnée fausse que rien n'aurait signalé.

## Contrat de données

Mesuré le 2026-08-16, migrations à l'appui :

**`service_provider_profiles`** — `user_id` **UNIQUE**, et **aucune colonne `agency_id`**. Un
prestataire a donc **un seul profil, global**, indépendant de toute agence. C'est le seul des quatre
profils dans ce cas ; `agent_profiles`, `agency_admin_profiles` et `owner_profiles` sont
agence-scopés.

**`service_provider_agency_collaborations`** — porte `(service_provider_profile_id, agency_id)` en
**contrainte unique**, plus `status`, `started_at`, `ended_at`, `metadata`. C'est la ligne qui
matérialise « ce prestataire travaille pour cette agence ».

Le pointeur `agency_role_id` sur le profil désignerait donc le rôle d'**une** agence pour un profil
qui en sert **N**. C'est une violation directe du principe non négociable n°2 — *une capacité se juge
toujours pour un couple (utilisateur, agence)* — et elle serait silencieuse : le résolveur rendrait
un verdict plausible, tiré du rôle de la mauvaise agence.

## Contraintes strictes (métier)

- **L'état actuel n'est pas cassé, et il ne faut pas le présenter comme tel.** La branche
  `service_provider` de `MembershipCapabilityResolver` reste sur la table de vérité phase 1 — qui est
  la **même source** que celle dont les rôles système sont seedés. Les verdicts sont donc identiques
  tant qu'aucun rôle personnalisé n'est créé pour un prestataire. Ce ticket ouvre une capacité, il ne
  répare pas une régression.
- **La décision est structurelle : ADR obligatoire avant implémentation** (règle du dépôt). Elle
  touche la forme d'une table et la granularité d'une autorisation.
- Toute sortie doit préserver la Règle 6 pour les trois autres profils — pas de `nullable` rétabli
  « pour uniformiser ».

## Les deux sorties telles qu'elles ont été soumises — **A retenue**

**A — le rôle vit sur la COLLABORATION** ✅ **RETENUE** (`service_provider_agency_collaborations.agency_role_id`).
La ligne porte déjà exactement le couple *(profil, agence)*, c'est-à-dire la granularité que le
principe n°2 exige. Un prestataire peut avoir un rôle différent par agence, ce qui est le cas d'usage
réel — « plombier référent » chez l'une, « prestataire ponctuel » chez l'autre. Coût : la Règle 6
devient « 1 profil = 1 rôle **par agence** » pour ce seul type, et le résolveur prend un chemin de
plus.

**B — le profil devient agence-scopé** ❌ **ÉCARTÉE.** Elle uniformisait le modèle avec les trois
autres profils, mais au prix d'un **retrait de capacité** : un prestataire ne pourrait plus servir
plusieurs agences avec un seul compte, et le `user_id` UNIQUE lui interdit d'en créer plusieurs.

> **La mesure penchait nettement vers A, et c'est ce qui a été retenu.** La table de collaboration a
> été créée pour porter le lien N:M, elle porte déjà `status` et des dates, et y ajouter le rôle ne
> change aucune cardinalité. B supposait que le multi-agence était une erreur — c'était une question
> produit, pas une question de schéma, et le produit a répondu que non.

## Delta à produire

- [ ] ADR numéroté qui **écrit la décision A** et ses conséquences sur la Règle 6 (la décision est prise ; l'ADR la rend durable)
- [ ] `docs/models-spec.md` §52-53 et **Règle 6** : écrire l'exception `service_provider` explicitement — une exception déduite d'une absence de colonne se perd
- [ ] Migration correspondante, `down()` juste, éprouvée sur MySQL 8.0
- [ ] Backfill : chaque collaboration existante reçoit le rôle système `service_provider` de **son**
      agence — vérifier qu'il n'en reste aucune sans rôle
- [ ] Brancher la branche `service_provider` du résolveur sur le pivot, avec le même cache indexé
      par `agency_role_id` que les trois autres
- [ ] Tests : un prestataire lié à deux agences avec deux rôles différents rend deux verdicts
      différents — c'est **le** test qui distingue A de l'état actuel
- [ ] Vérifier par ablation que ce test échoue sans le correctif

## Critères d'acceptation

- [ ] AC1 — la décision A est écrite en ADR avant la première ligne de code
- [ ] AC2 — un prestataire lié à deux agences obtient les capacités de **l'agence demandée**, et un
      test le prouve avec deux rôles réellement différents
- [ ] AC3 — aucune collaboration existante ne reste sans rôle après backfill, vérifié par requête
- [ ] AC4 — les trois autres profils gardent `agency_role_id` NOT NULL ; aucun `nullable` rétabli
- [ ] AC5 — la suite backend reste verte, sans assertion assouplie

## Hors périmètre

- Les trois profils agence-scopés, livrés par TCK-279.
- L'interface d'édition des rôles — TCK-279, partie frontend.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
