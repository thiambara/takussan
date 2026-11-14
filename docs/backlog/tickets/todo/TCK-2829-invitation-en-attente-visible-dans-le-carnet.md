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

- [x] Une invitation envoyée par l'API réelle (`POST /api/agencies/{agency}/service-providers/invite`) apparaît dans `GET /api/agencies/{agency}/service-providers` sans filtre, et `filter[search]=<son nom>` la trouve. Test de fonctionnalité qui échoue sans le correctif (ablation).
  *Preuve :* `CarnetInvitationEnAttenteTest`::test_une_invitation_envoyee_par_l_api_parait_au_carnet_par_defaut_et_se_trouve (POST réel, liste, `filter[search]` par nom et numéro, `filter[zone]`, `meta.zones`, `pending_invitation_id`) — rouge au HEAD avant correctif ; rouge si le OU n'est pas groupé (ablation 4).
- [x] Un prestataire actif dont la collaboration avec l'agence est `paused` (suspendue) n'apparaît pas dans le carnet par défaut. Test qui échoue si le défaut devient `active,paused`.
  *Preuve :* `CarnetInvitationEnAttenteTest`::test_une_collaboration_suspendue_reste_hors_du_carnet_par_defaut — le suspendu porte même une invitation `sent` de l'agence ; rouge si le défaut devient `active,paused` (ablation 5) et si le critère `draft` saute (ablation 1).
- [x] L'invitation d'une **autre** agence n'apparaît jamais, ni dans la liste, ni dans la recherche, ni dans `meta.zones` (test de fuite inter-agence, ablation).
  *Preuve :* `CarnetInvitationEnAttenteTest`::test_l_invitation_d_une_autre_agence_ne_sort_jamais — liste, recherche, zone et `meta.zones` ; rouge sans l'agence de l'invitation (ablation 2) et sans l'agence de la collaboration `paused` (ablation 3).
- [x] Au navigateur (390 et 1280), une invitation de démo paraît marquée « Invitation envoyée », avec Renvoyer et Révoquer, et le sous-titre la compte.
  *Preuve :* relevés 390 et 1280 de `/app/maintenance/providers` (persona `personas-gerant`, Agence des personas) : « 1 actif · 1 invitation en attente », Ibrahima Fall marqué « Invitation envoyée » avec « Renvoyer l'invitation » et « Révoquer », sans aucun filtre envoyé par le front.

## Notes d'implémentation (2026-11-14)

- **Forme retenue : critère dans le périmètre par défaut, sans valeur de filtre neuve.** `scopeForAgency()` reçoit `null` quand `filter[collaboration_status]` est absent ou sans valeur connue, et rend alors : collaboration `active` avec l'agence, **ou** profil `draft` + collaboration `paused` avec l'agence + invitation `sent` de cette agence (`Invitation::idEnvoyeePour()`, la sous-requête même de `pending_invitation_id`). Le OU vit dans un seul `where` groupé : recherche, zone et `filter[status]` posés par spatie s'appliquent aux invitations. `meta.zones` suit le même périmètre.
- Un `filter[collaboration_status]` explicite garde son sens : `active` ne rend pas les invitations, `paused` rend suspendues et invitations comme avant (`useAssignableProviders` envoie `active`, `useCarnetActif` filtre `status=active`).
- Une invitation révoquée (ou expirée par le cron) sort du carnet par défaut ; elle reste lisible par `filter[collaboration_status]=paused`.
- Hors périmètre : l'invitation d'un prestataire qui a déjà un profil ailleurs (TCK-262) ne crée aucune collaboration avant l'acceptation ; elle reste invisible au carnet.

