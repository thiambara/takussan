---
id: TCK-228
title: "Préférences notifications — corriger le crash au toggle"
status: done
phase: P1
family: bug
estimate: S
wave: 25
created: 2026-05-08
updated: 2026-05-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#12-appnotification-
tags: [front, notifications, preferences, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un utilisateur doit pouvoir activer ou désactiver une préférence de notification sans faire planter la page.

## Contrat de données

Finding smoke `docs/smoke-tests/utilisateurs-authentifies-2026-05-08.md` : `TC-NOTIF-07` provoque une erreur runtime sur `/app/profile/notifications` au toggle `Nouveau message - Email`.

## Direction UX / Artistique

Conserver la matrice existante ; le correctif doit rendre l'action fiable avec un retour d'état discret, sans refonte visuelle.

## Contraintes strictes (métier)

- Le canal in-app reste non désactivable.
- Les canaux SMS indisponibles restent désactivés tant que le téléphone n'est pas vérifié.
- Un échec API ne doit jamais laisser la matrice dans un état incohérent ni provoquer une erreur plein écran.

## Delta à produire

- [ ] Corriger le flux de mutation de la matrice de préférences sur `/app/profile/notifications`.
- [ ] Stabiliser la forme de données utilisée après sauvegarde pour éviter les collections `undefined`.
- [ ] Préserver le rollback UI ou l'invalidation de cache en cas d'échec API.
- [ ] Ajouter un test front couvrant le toggle d'une préférence email.

## Critères d'acceptation

- [ ] Le toggle `Nouveau message - Email` persiste le changement sans runtime error.
- [ ] Un reload de `/app/profile/notifications` reflète la préférence sauvegardée.
- [ ] Les cases SMS restent désactivées pour un utilisateur sans téléphone vérifié.
- [ ] Le test front ciblé échoue avant correction et passe après correction.

## Hors périmètre

- Push web réel et service worker.
- Refonte de la page de préférences.
- Création de nouveaux types d'événements de notification.

## Notes d'implémentation

La mutation API renvoie désormais la même forme que le chargement initial ; le composant garde aussi une normalisation défensive pour les réponses partielles héritées.
