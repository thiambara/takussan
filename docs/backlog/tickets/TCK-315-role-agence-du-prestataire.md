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

## ⚠️ Ce ticket attend un ADR avant toute ligne de code

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

## Les deux sorties, et ce que la mesure en dit

**A — le rôle vit sur la COLLABORATION** (`service_provider_agency_collaborations.agency_role_id`).
La ligne porte déjà exactement le couple *(profil, agence)*, c'est-à-dire la granularité que le
principe n°2 exige. Un prestataire peut avoir un rôle différent par agence, ce qui est le cas d'usage
réel — « plombier référent » chez l'une, « prestataire ponctuel » chez l'autre. Coût : la Règle 6
devient « 1 profil = 1 rôle **par agence** » pour ce seul type, et le résolveur prend un chemin de
plus.

**B — le profil devient agence-scopé**, comme les trois autres. Uniformise le modèle. Coût : c'est un
**retrait de capacité** — un prestataire ne pourrait plus servir plusieurs agences avec un seul
compte, ou il lui faudrait N profils, ce que le `user_id` UNIQUE interdit aujourd'hui. À valider
auprès du produit avant tout : la table de collaboration existe précisément parce que le multi-agence
a été voulu.

> **La mesure penche nettement vers A**, et il faut le dire plutôt que de présenter deux options à
> égalité : la table de collaboration a été créée pour porter le lien N:M, elle porte déjà `status`
> et des dates, et y ajouter le rôle ne change aucune cardinalité. B suppose que le multi-agence
> était une erreur — ce qui est possible, mais c'est une question produit, pas une question de
> schéma.

## Delta à produire

- [ ] ADR numéroté qui tranche A ou B, avec ses conséquences sur la Règle 6
- [ ] Mettre à jour `docs/models-spec.md` §52-53 et la Règle 6 selon l'arbitrage
- [ ] Migration correspondante, `down()` juste, éprouvée sur MySQL 8.0
- [ ] Backfill : chaque collaboration existante reçoit le rôle système `service_provider` de **son**
      agence — vérifier qu'il n'en reste aucune sans rôle
- [ ] Brancher la branche `service_provider` du résolveur sur le pivot, avec le même cache indexé
      par `agency_role_id` que les trois autres
- [ ] Tests : un prestataire lié à deux agences avec deux rôles différents rend deux verdicts
      différents — c'est **le** test qui distingue A de l'état actuel
- [ ] Vérifier par ablation que ce test échoue sans le correctif

## Critères d'acceptation

- [ ] AC1 — la décision est écrite en ADR avant la première ligne de code
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
