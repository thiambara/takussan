---
id: TCK-067
title: "Admin — Modération avis & signalements UI"
status: todo
phase: P2
family: front
estimate: M
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-033, TCK-057, TCK-054, TCK-018]
blocks: []
spec_refs:
  features:
    - docs/features.md#111-avis--réputation
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#20-review
tags: [admin, moderation, reviews, front]
---

## Contexte

TCK-033 (avis & réputation) est `review` : backend gère la modération (masquer, supprimer, workflow status `pending/approved/rejected`, signalements). La page `/admin/moderation` existe en stub (18 lignes). Aucune UI pour traiter les files d'attente de modération.

## Objectif utilisateur

Un super admin doit pouvoir consulter la file d'attente des avis signalés ou en attente de modération, les approuver, masquer ou supprimer, et tracer chaque action dans l'audit.

## Contrat de données

Endpoints à consommer (existants, TCK-033) :

- `GET /api/reviews` — liste (filter[moderation_status]=pending|flagged|approved|rejected, filter[reported]=1, sort=-reported_at)
- `PATCH /api/reviews/{id}/moderate` — body `{ decision: 'approve'|'hide'|'delete', reason?: string }`
- `GET /api/reviews/{id}/reports` — liste des signalements (motif, reporter_id, created_at)
- `GET /api/activity-log` (TCK-018) — historique des actions de modération (filter[subject_type]=Review)

Sparse fieldsets : `fields[reviews]=id,rating,comment,moderation_status,reported_count,created_at,subject_type,subject_id,author_id`.

## Direction UX / Artistique

File d'attente à la Discourse / Reddit mod queue. Colonne principale = liste des avis avec extrait + compteur signalements + badge statut. Panneau latéral = détail de l'avis sélectionné avec commentaire intégral, liste des signalements, actions claires (Approuver · Masquer · Supprimer · Ignorer). Raccourcis clavier encouragés (J/K pour naviguer).

## Contraintes strictes (métier)

- Seuls `super_admin` accèdent à la page (redirect sinon).
- Chaque décision de modération doit être accompagnée d'une raison (sauf "Approuver") — champ texte requis.
- L'action "Supprimer" est irréversible (soft delete backend) — confirmation explicite.
- Toutes les actions sont loguées automatiquement via journal d'activité (backend).

## Delta à produire

- [ ] Remplacer le stub `/admin/moderation/page.tsx` par l'UI fonctionnelle
- [ ] Vue split : liste avis signalés/en attente + panneau détail
- [ ] Filtres : statut modération, date, type de subject (bien, agent, agence)
- [ ] Actions de modération avec raison + confirmation pour "Supprimer"
- [ ] Compteur de file d'attente dans la sidebar admin (badge "5 en attente")
- [ ] Tests Vitest : rendu liste, flow décision, guard super_admin

## Critères d'acceptation

- [ ] AC1 — Un `super_admin` voit la liste des avis signalés + en attente, filtrable et triée par date
- [ ] AC2 — Le panneau détail affiche l'avis complet, la liste des signalements avec motif et auteur
- [ ] AC3 — Chaque action (approuver, masquer, supprimer) persiste le nouveau statut et rafraîchit la liste sans full reload
- [ ] AC4 — L'action "Supprimer" demande une raison + confirmation ; l'avis disparaît de la liste après exécution
- [ ] AC5 — La sidebar admin affiche le compteur de file d'attente (rafraîchi au polling raisonnable ou au focus de la route)
- [ ] AC6 — Un non-`super_admin` est redirigé
- [ ] AC7 — `npm run build` + `npm run test` verts

## Hors périmètre

- Détection automatique d'avis suspects (IA, P3)
- Modération des messages / documents (P2, ticket séparé si besoin)
- Workflow de validation des biens avant publication (→ ticket dédié si demandé)

## Notes d'implémentation

_(Rempli à l'implémentation)_
