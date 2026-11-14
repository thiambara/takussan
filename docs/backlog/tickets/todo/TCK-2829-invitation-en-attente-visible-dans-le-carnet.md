---
id: TCK-2829
title: "Carnet des prestataires : une invitation en attente se voit et se trouve, distincte d'une collaboration suspendue"
status: todo
phase: P2
family: full
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2772]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
    - "docs/models-spec.md#39-serviceprovideragencycollaboration-"
tags: [back, front, maintenance, prestataires, carnet, invitation, suite-de-tck-2772, audit-ux, app]
---

## Objectif utilisateur

L'agent qui vient d'inviter un prestataire le retrouve dans le carnet, marqué « Invitation envoyée », et peut le chercher par son nom ou son numéro. Il ne voit pas pour autant, mêlés au carnet, les prestataires dont la collaboration est suspendue.

## Constat (2026-11-14, relu dans le code pendant TCK-2772)

- `ServiceProviderInvitationService` crée la collaboration du brouillon en `paused`, en attendant l'acceptation.
- `ServiceProviderProfileController::scopeForAgency()` ne liste par défaut que les collaborations `active` (TCK-592). Le carnet (`ServiceProvidersList`) n'envoie pas `filter[collaboration_status]`.
- Une invitation en attente n'est donc **ni listée ni trouvable** à l'écran. L'écran a pourtant tout ce qu'il faut pour l'afficher : « Invitation envoyée », Renvoyer, Révoquer (TCK-2653, P237.01). La recherche de TCK-2772 ne la trouve qu'avec `filter[collaboration_status]=active,paused`.
- `paused` couvre **aussi** les collaborations suspendues (TCK-592 : pause, reprise, fin). Envoyer `active,paused` par défaut mêlerait au carnet les prestataires suspendus : c'est un changement de produit, refusé par la session le 2026-11-14 (décision 2 de TCK-2772).

## Delta

- **API :** le carnet par défaut rend les collaborations `active` **et** les invitations en attente. Une invitation en attente, c'est un profil `draft` dont la collaboration avec l'agence est `paused`, avec une invitation `sent` de cette agence (`pending_invitation_id`). Une collaboration `paused` d'un profil actif reste hors du défaut, et `filter[collaboration_status]` garde son sens. Ce ticket tranche la forme : critère de profil `draft` dans le périmètre par défaut, ou valeur dédiée de filtre (`invited`). La forme retenue s'écrit dans les notes.
- **API :** `filter[search]` et `filter[zone]` (TCK-2772) trouvent l'invitation par la même lecture par défaut.
- **Front :** rien à ajouter si le défaut de l'API change. Le sous-titre « N invitations en attente » compte alors juste.

## Critères d'acceptation

- [ ] Une invitation envoyée par l'API réelle (`POST /api/agencies/{agency}/service-providers/invite`) apparaît dans `GET /api/agencies/{agency}/service-providers` sans filtre, et `filter[search]=<son nom>` la trouve. Test de fonctionnalité qui échoue sans le correctif (ablation).
- [ ] Un prestataire actif dont la collaboration avec l'agence est `paused` (suspendue) n'apparaît pas dans le carnet par défaut. Test qui échoue si le défaut devient `active,paused`.
- [ ] L'invitation d'une **autre** agence n'apparaît jamais, ni dans la liste, ni dans la recherche, ni dans `meta.zones` (test de fuite inter-agence, ablation).
- [ ] Au navigateur (390 et 1280), une invitation de démo paraît marquée « Invitation envoyée », avec Renvoyer et Révoquer, et le sous-titre la compte.
