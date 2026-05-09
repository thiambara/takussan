---
id: TCK-238
title: "Super-admin agences - compléter la liste plateforme"
status: review
phase: P1
family: bug
estimate: M
created: 2026-05-09
updated: 2026-05-09
depends_on: [TCK-145, TCK-208]
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#1-user
    - docs/models-spec.md#3-property
tags: [front, back, super-admin, agencies, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un super-admin doit pouvoir comparer rapidement toutes les agences depuis `/super-admin/agencies` sans ouvrir chaque fiche individuellement.

## Contrat de données

Finding smoke `docs/smoke-tests/super-admin-2026-05-08.md` : `TC-SUP-08` observe que la liste agences affiche nom, slug, statut, email, licence et actions, mais pas les informations de synthèse attendues par la QA.

Endpoints concernés : `GET /api/admin/agencies` et les éventuelles ressources dérivées déjà exposées par la console super-admin.

## Direction UX / Artistique

La page doit rester une vue back-office dense et scannable : identité agence à gauche, indicateurs courts au centre, statut et actions à droite. Les filtres doivent être visibles sans transformer la page en dashboard décoratif.

## Contraintes strictes (métier)

- La liste reste réservée au rôle `super_admin`.
- Les données de synthèse doivent venir du backend ou de compteurs déjà exposés, pas d'agrégation client sur des pages paginées.
- Le frontend doit continuer à utiliser `fields[...]`, `filter[...]`, `include=` et le tri serveur.
- La pagination ne doit pas être contournée pour calculer des totaux.

## Delta à produire

- [ ] Compléter la ressource `GET /api/admin/agencies` pour exposer les champs de synthèse nécessaires à la liste si absents.
- [ ] Ajouter les compteurs membres et biens, et une donnée de dernière activité exploitable côté liste.
- [ ] Afficher logo, statut, compteurs, date de création et dernière activité sur `/super-admin/agencies`.
- [ ] Ajouter filtre par plage de dates et tri serveur par date, nom, taille et volume lorsque supportés.
- [ ] Ajouter tests backend pour payload, filtres et tris.
- [ ] Ajouter tests frontend ou smoke automatisé pour colonnes, filtres et état vide.

## Critères d'acceptation

- [ ] `/super-admin/agencies` affiche toutes les agences paginées avec identité, statut, compteurs, date de création et dernière activité.
- [ ] La recherche nom/slug et les filtres statut/date modifient la requête serveur.
- [ ] Les tris date, nom, taille et volume sont appliqués côté serveur ou explicitement désactivés si le backend les refuse.
- [ ] Un rôle non-super-admin ne peut pas appeler `GET /api/admin/agencies`.

## Hors périmètre

- Modification de la fiche détaillée agence.
- Actions de vérification, suspension ou onboarding.
- Nouveaux KPI financiers par agence.

## Notes d'implémentation

Le compteur membres est calculé côté API depuis les profils polymorphes et collaborations agence, sans dépendre de `users.agency_id`.
