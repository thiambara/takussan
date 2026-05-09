---
id: TCK-237
title: "Super-admin reporting - corriger l'export CSV"
status: review
phase: P2
family: bug
estimate: S
created: 2026-05-09
updated: 2026-05-09
depends_on: [TCK-227]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#26-audit--traçabilité
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#1-user
    - docs/models-spec.md#43-plan-
    - docs/models-spec.md#44-agencysubscription-
tags: [back, super-admin, reporting, export, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un super-admin doit pouvoir télécharger un export exploitable depuis les rapports plateforme et retrouver cet export dans l'audit.

## Contrat de données

Finding smoke `docs/smoke-tests/super-admin-2026-05-08.md` : `TC-SUP-07` observe que `GET /api/admin/reports/growth/export?format=csv...` répond `200` mais retourne du JSON au lieu d'un téléchargement CSV.

Endpoints concernés : `GET /api/admin/reports/{report}/export?format=csv|xlsx` et l'audit super-admin associé.

## Direction UX / Artistique

Le bouton d'export de `/super-admin/reports` doit garder un feedback discret : état de chargement, succès téléchargement, erreur lisible si le format ou les paramètres sont invalides.

## Contraintes strictes (métier)

- Les endpoints restent strictement `super_admin`.
- L'export doit réutiliser exactement les filtres du rapport courant.
- Un export synchrone doit retourner un vrai fichier avec `Content-Type` et `Content-Disposition` cohérents.
- Un export asynchrone doit retourner un statut exploitable par le frontend, sans masquer l'audit.
- Chaque export réussi produit une entrée d'audit `super_admin_*`.

## Delta à produire

- [ ] Corriger l'action d'export du reporting pour retourner un fichier CSV quand `format=csv`.
- [ ] Vérifier et corriger le chemin XLSX si le même comportement JSON est présent.
- [ ] Brancher le bouton `Exporter CSV` sur le comportement fichier ou sur le statut async attendu.
- [ ] Ajouter un test backend sur headers, contenu et statut pour `growth`, puis au moins un test de non-régression pour un second rapport.
- [ ] Ajouter un test d'audit sur export réussi.

## Critères d'acceptation

- [ ] `GET /api/admin/reports/growth/export?format=csv&metric=agencies&period=12m` retourne un téléchargement CSV, pas un JSON tabulaire.
- [ ] Le CSV contient les colonnes et lignes correspondant aux filtres demandés.
- [ ] Un `agency_admin` reçoit 403 et un anonyme reçoit 401 sur l'export.
- [ ] L'export est visible dans l'audit cross-tenant avec le super-admin comme auteur.

## Hors périmètre

- Création d'un nouveau report builder.
- Nouveaux indicateurs ou nouveaux rapports.
- Refonte visuelle complète de `/super-admin/reports`.

## Notes d'implémentation

Exports synchrones branchés sur `ExportWriter`; le proxy Next conserve désormais les réponses binaires et `Content-Disposition`.
