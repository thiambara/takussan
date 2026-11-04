---
id: TCK-1005
title: "Un participant retiré d'un groupe par un administrateur perd la relation née du groupe"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-participant-retiré-dun-groupe-par-son-administrateur-garde-tous-les-membres-comme-contacts-et-peut-ouvrir-une-directe-avec-chacun"
tags: [back, messaging, pistes]
---

## Objectif utilisateur

Un participant qu'un administrateur retire d'un groupe ne retrouve pas, par une directe ouverte
aussitôt, les membres dont on vient de l'écarter ; et ces membres ne le voient plus comme contact.

## Contexte

Réf : **P51.02** du fichier de pistes, `validé` (critère V7 accordé).

La règle 1 de `MessagingReach` (correspondants) lit `participatingQuery($actor, activeOnly: false)`
et prend tous les participants des fils, `left_at` compris, sans distinguer un départ volontaire
d'un retrait. Mesuré avant correctif (test de garde ci-dessous, sans le correctif) : après
`DELETE /api/conversations/{id}/participants/{retiré}`, le retiré lit encore l'administrateur,
le membre restant et un membre parti de lui-même dans `GET /api/conversations/contacts`.

## Décision du porteur

> un participant retiré par un administrateur perd la relation née du groupe dans les deux sens (la règle 1 ne compte plus ce fil pour lui, ni lui pour les autres), lu par le message système `removed`, sans migration ; un départ volontaire, la règle 4 et la ré-invitation par un administrateur restant ne changent pas ; test « membre retiré → absent des contacts de l'autre, 422 sur la directe » (porteur, 2026-10-19, sur la recommandation du délégué)

## Hypothèses (mode sans humain)

- Le « message système `removed` » est celui que pose `SystemMessageFactory::participantRemoved()` :
  `metadata.event = participant_removed`, `target_id`, et `self_leave` vrai pour un départ
  volontaire. C'est le **dernier** de ces messages, pour ce participant dans ce fil, qui dit
  comment sa participation s'est close.
- Une ré-invitation remet `left_at` à null : la participation compte de nouveau, sans autre trace.
- La ré-invitation reste possible : pour le groupe même qu'on complète
  (`GET /api/conversations/{id}/contacts`, `AddParticipantsRequest`), un participant retiré de
  ce groupe reste proposé et accepté.

## Delta à produire

- [x] `MessagingReach::query()`, règle 1 : un fil dont l'acteur a été retiré ne compte plus ; un
  participant retiré d'un fil n'est plus compté, sauf pour le groupe qu'on complète.
- [x] Test : `MessagingContactsTest::test_un_membre_retire_par_un_administrateur_perd_la_relation_nee_du_groupe`.

## Critères d'acceptation

- [x] AC1 — le retiré ne voit plus les membres du groupe, et sa directe vers l'un d'eux rend 422.
- [x] AC2 — un membre restant ne voit plus le retiré, et sa directe vers lui rend 422.
- [x] AC3 — un départ volontaire garde la relation, dans les deux sens.
- [x] AC4 — l'administrateur restant voit le retiré dans le sélecteur du groupe et le ré-invite
  (201) ; ré-invité, le retiré retrouve ses contacts.

## Hors périmètre

- Aucune migration (pas de colonne `removed_by`).
- La règle 4 et les règles 2 et 3 sont inchangées : un retiré qui partage une agence ou une fiche
  client avec un membre reste joignable par elles.

## Notes d'implémentation

- Ablation : `removedByAdmin()` neutralisé (`whereRaw('1 = 0')`) → 1 rouge (le retiré voit encore
  3 contacts) ; exception du groupe complété retirée → 1 rouge (le retiré n'est plus proposé à la
  ré-invitation) ; remis → 24 verts sur la classe.
- `target_id` est un entier dans le JSON : la comparaison se fait en texte
  (`metadata->>'target_id' = user_id::text`).
