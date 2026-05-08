---
id: TCK-231
title: "Profil — synchroniser édition et avatar"
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
    - docs/features.md#21-authentification--comptes
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#1-user
tags: [front, back, profile, media, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un utilisateur doit voir immédiatement les changements de profil sauvegardés et pouvoir gérer son avatar.

## Contrat de données

Findings smoke `docs/smoke-tests/utilisateurs-authentifies-2026-05-08.md` : `TC-AUTH-27` sauvegarde le nom sans mettre l'en-tête à jour, `TC-AUTH-29` ne trouve pas d'upload avatar et `TC-AUTH-49` signale des champs métier agent incomplets.

## Direction UX / Artistique

Conserver la structure actuelle du profil ; rendre les changements visibles sans reload forcé et intégrer l'avatar comme action naturelle de la zone identité.

## Contraintes strictes (métier)

- Les données affichées après sauvegarde doivent provenir de la source API ou d'un cache invalidé.
- L'upload avatar doit respecter les règles média et ne pas accepter de fichier invalide.
- Les champs de profil métier doivent rester en lecture ou édition selon les permissions existantes.

## Delta à produire

- [ ] Corriger l'invalidation ou la mise à jour du cache profil après sauvegarde nom/bio.
- [ ] Ajouter le flux d'upload/remplacement/suppression d'avatar sur la surface profil.
- [ ] Vérifier l'affichage des champs métier agent déjà disponibles côté API.
- [ ] Ajouter des tests front pour sauvegarde du nom et rendu de l'avatar.

## Critères d'acceptation

- [ ] Sauvegarder prénom/nom dans la modale met à jour l'en-tête profil immédiatement.
- [ ] Recharger `/app/profile` conserve le nom sauvegardé.
- [ ] Un utilisateur peut uploader un avatar valide et voir la prévisualisation mise à jour.
- [ ] Un fichier avatar invalide est refusé avec un message localisé.

## Hors périmètre

- Création de nouveaux champs de profil métier non spécifiés.
- KYC documentaire des profils.
- Refonte complète de `/app/profile`.

## Notes d'implémentation

Avatar câblé sur la collection medialibrary `avatar` existante ; le brouillon local de la modale est réinitialisé à la fermeture pour éviter une prévisualisation non sauvegardée hors modale.
