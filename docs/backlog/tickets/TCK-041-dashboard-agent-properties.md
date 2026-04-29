---
id: TCK-041
title: "Dashboard Agent — Layout & biens"
status: done
phase: P0
family: front
estimate: M
created: 2026-04-15
updated: 2026-04-30
depends_on: [TCK-054, TCK-055, TCK-056, TCK-057, TCK-036]
blocks: [TCK-042]
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#112-agence--équipe
  models: [docs/models-spec.md#3-property]
tags: [front, dashboard, agent, property, crud]
---

## Objectif utilisateur

Un agent se connecte et gère ses biens depuis un dashboard professionnel.

## Contrat de données

- `GET /api/properties` — liste des biens (scopé par agent/agence via Policy)
- `POST /api/properties` — création
- `PUT /api/properties/{property}` — édition
- `DELETE /api/properties/{property}` — soft delete
- `POST /api/properties/{property}/photos` — upload photos
- `PUT /api/properties/{property}/status` — changement statut
- `PUT /api/properties/{property}/visibility` — publier/dépublier
- `POST /api/properties/{property}/tags` — associer tags
- `GET /api/properties/{property}/price-history` — historique prix

## Direction UX / Artistique

- **Layout dashboard** : sidebar navigation + zone contenu. Style pro mais pas froid. L'IA choisit l'implémentation (sidebar collapsible, top nav + sidebar, etc.).
- **Liste des biens** : vue tabulaire ou cards. Filtres rapides (statut, type). Recherche locale ou API.
- **Formulaire création/édition** : multi-sections ou stepper. Upload photos avec drag & drop. Prévisualisation.
- **Actions rapides** : publier/dépublier, changer statut — sans ouvrir la fiche complète.
- **Navigation** : menu avec entrées Biens, Clients (→ TCK-042), et placeholders pour les futures sections (Baux, Réservations, etc.).

## Contraintes strictes (métier)

- Accès réservé aux rôles `agent`, `agency_admin`, `super_admin` (vérifié côté proxy + API)
- Un agent ne voit/édite que les biens de son agence
- Le formulaire de création doit valider côté client AVANT envoi (champs requis : title, type, contract_type, price, city minimum)
- La suppression est un soft delete (confirmation requise dans l'UI)

## Delta à produire

- [ ] Layout dashboard (sidebar + zone contenu)
- [ ] Liste des biens avec filtres et recherche
- [ ] Formulaire création/édition de bien (avec upload photos)
- [ ] Actions rapides : publier/dépublier, changer statut
- [ ] Navigation dashboard avec placeholders

## Critères d'acceptation

- [ ] Un agent voit uniquement les biens de son agence
- [ ] Il peut créer, éditer, supprimer un bien
- [ ] Les actions rapides (statut, visibilité) fonctionnent sans recharger la page
- [ ] Le formulaire valide les champs requis côté client

## Hors périmètre

- CRM clients (→ TCK-042)
- Baux, réservations, paiements (→ Phase 3)
