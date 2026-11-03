---
id: TCK-1186
title: "Un fields envoyé à une liste qui ne le lit pas se dit dans le fichier qui l'envoie"
status: done
phase: P3
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1184]
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-100--fields-du-front-face-aux-queryfields-et-ce-que-lécran-lit-hors-de-sa-demande"
tags: [front, sparse-fieldsets, documentation, pistes]
---

## Contexte

Réf : **P100.05** du fichier de pistes, `validé` (V6 accordé). Des fetchers envoient `fields[…]` à
des listes écrites à la main, sans `buildQuery` : le paramètre n'y est ni honoré ni refusé, et
seuls `property-moderation.ts` et `recherche-publique.ts` le disaient.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenu** : la voie la plus étroite, que recommandait le délégué : documenter le `fields`
inerte à chaque site qui l'envoie, comme `property-moderation.ts`, et nommer ces endpoints dans la
liste motivée de la garde de TCK-1184. Le paramètre reste envoyé : il déclare ce que l'écran lit.

## Reste à faire

- porter les conversations (`ConversationController`, sondées toutes les 10 s) sur `buildQuery`,
  ce qui demande d'écrire `Conversation::$queryFields` : une piste à part.

## Objectif utilisateur

Personne ne lit plus un `fields` inerte comme une charge réduite.

## Delta à produire

- [x] Un commentaire « `fields` inerte » à chaque site : `conversations-list.ts`,
      `conversations.ts` (×2), `saved-searches.ts`, `reviews-moderation.ts`, `super-admin.ts` (×3),
      la page des utilisateurs de la console, `profiles.ts`, `leases.ts`.
- [x] La garde de TCK-1184 exige qu'un fichier qui envoie un `fields` d'une exception le dise.

## Critères d'acceptation

- [x] AC1 — tout fichier dont une demande relève de `HORS_BUILD_QUERY` ou de
      `SITES_HORS_BUILD_QUERY` dit, sur une même ligne, que `fields` y est inerte ou non lu.

## Hors périmètre

- `ConversationContextController`, `MessagingContactController` et `AgencyController::listMembers`,
  que la piste cite « sans autre effet relevé » : leurs tables ont un `$queryFields`, la garde ne
  les distingue pas.

## Notes d'implémentation

- Ablation : l'assertion a été écrite avant les commentaires → rouge sur 9 fichiers
  (`property-moderation.ts` compris, dont la formule « non lus » est ensuite acceptée).
