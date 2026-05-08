---
id: TCK-229
title: "Notifications — restaurer la cloche et le feed"
status: review
phase: P0
family: bug
estimate: M
created: 2026-05-08
updated: 2026-05-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#12-appnotification-
tags: [front, notifications, dashboard, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un utilisateur connecté doit accéder à son centre de notifications depuis le shell authentifié.

## Contrat de données

Finding smoke `docs/smoke-tests/utilisateurs-authentifies-2026-05-08.md` : `TC-NOTIF-01` ne trouve aucune cloche visible dans la navbar dashboard/profil, ce qui bloque les tests lu/non-lu.

## Direction UX / Artistique

Intégrer la cloche dans le header existant avec un badge non-lu lisible, un feed compact et des états vide/chargement cohérents avec le dashboard.

## Contraintes strictes (métier)

- Le feed ne montre que les notifications de l'utilisateur courant.
- Les actions de lecture doivent mettre à jour le badge sans reload complet.
- Le composant doit rester disponible sur les vues `/app/*`, y compris `/app/profile`.

## Delta à produire

- [ ] Restaurer l'entrée visuelle du centre de notifications dans le shell authentifié.
- [ ] Câbler le feed paginé ou dropdown sur les endpoints notifications existants.
- [ ] Câbler les actions marquer comme lu/non lu et tout marquer comme lu.
- [ ] Ajouter des tests front pour visibilité de la cloche, badge et action de lecture.

## Critères d'acceptation

- [ ] Une cloche de notifications est visible sur `/app` et `/app/profile`.
- [ ] Le badge non-lu correspond au payload API courant.
- [ ] Ouvrir le feed affiche les notifications triées par date.
- [ ] Marquer une notification comme lue met à jour le feed et le badge sans navigation.

## Hors périmètre

- Temps réel Reverb/Pusher si le polling existant suffit.
- Création de nouveaux événements métier de notification.
- Templates email ou SMS.

## Notes d'implémentation

Ajout de l'action non-lue côté API pour couvrir le contrat lu/non-lu de la spec ; le feed reste alimenté par les endpoints notifications existants.
