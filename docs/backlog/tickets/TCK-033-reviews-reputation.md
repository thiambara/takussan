---
id: TCK-033
title: Avis & réputation
status: done
phase: P2
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-013, TCK-034]
blocks: []
spec_refs:
  features:
    - docs/features.md#111-avis--réputation
  models:
    - docs/models-spec.md#11-review
tags: [back, front, reviews, ratings, moderation, reputation]
---

## Contexte

Le modèle `Review` existe déjà avec des enrichissements prévus (`reply_content`, `replied_by_id`, `reported_count`). Ce domaine est entièrement P2/P3 — il n'est pas bloquant pour le MVP mais améliore significativement la confiance utilisateur.

## Objectif

Implémenter le système d'avis publics avec notation, modération, réponses et signalements.

## Delta à produire

### P2

- [ ] Migration Review : ajout `reply_content`, `replied_by_id`, `replied_at`, `reported_count`
- [ ] Endpoint `POST /api/reviews` — laisser un avis sur un bien, un agent ou une agence (polymorphique via `reviewable`) — un seul avis par `(user, reviewable)` ; délai minimum : 24h après la fin d'une réservation/bail confirmée
- [ ] Endpoint `GET /api/{entity}/{id}/reviews` — consulter les avis publics (approuvés uniquement)
- [ ] Endpoint `PUT /api/admin/reviews/{review}/approve` — modération (approuver)
- [ ] Endpoint `DELETE /api/admin/reviews/{review}` — modération (supprimer)
- [ ] Endpoint `POST /api/reviews/{review}/reply` — réponse publique du propriétaire/agence
- [ ] Endpoint `POST /api/reviews/{review}/report` — signaler un avis inapproprié (incrémente `reported_count`, déclenche modération si seuil atteint)
- [ ] Mise à jour `average_rating` et `reviews_count` sur Property/Agency (via Observer)
- [ ] Pages Next.js : affichage avis sur fiche bien/agence, formulaire d'avis, modération admin
- [ ] Tests : `ReviewCreationTest`, `ReviewModerationTest`, `ReviewReplyTest`, `ReviewReportTest`, `ReviewRatingCacheTest`

### P3

- [ ] Détection automatique d'avis suspects (fréquence, IP, contenu)
- [ ] Badges de réputation (calculés sur note moyenne + volume)

## Critères d'acceptation

- [ ] Un client connecté peut laisser un avis avec une note de 1 à 5
- [ ] Un seul avis par `(user, reviewable)` est autorisé (rejet 409 en cas de doublon)
- [ ] L'avis ne peut être soumis que 24h minimum après la fin de la réservation/bail associé(e) (rejet 422 avant ce délai)
- [ ] Seuls les avis approuvés sont visibles publiquement
- [ ] Un propriétaire/agence peut répondre publiquement à un avis
- [ ] Un signalement incrémente `reported_count` et notifie les admins si seuil atteint
- [ ] `average_rating` et `reviews_count` sont mis à jour automatiquement

## Hors périmètre

- Détection automatique d'avis suspects (→ P3 futur)
- Badges de réputation (→ P3 futur)

## Notes d'implémentation

### Réalisé (2026-04-22)

- Enum `App\Models\Enums\ReviewStatus` (pending / approved / rejected / reported) avec matrice de transitions (`allowedTransitions`, `canTransitionTo`).
- Migration `add_moderation_workflow_to_reviews_table` — ajoute `status` et `reported_count` (les champs `reply_content`, `replied_by_id`, `replied_at`, `metadata` existaient déjà via la migration de création).
- `ReviewController` : endpoints `reply`, `approve`, `reject`, `report` avec assertion de transition (422 si invalide). Signalement auto → `reported` quand `reported_count >= config('takussan.reviews.report_threshold', 1)`, sauf si `rejected`.
- Modèle `Review` : cast `status => ReviewStatus`, fillable étendus.
- `ReviewResource` expose `status`, `reported_count`, `reply_content`, `replied_at`.
- Tests : `ReviewModerationWorkflowTest` (9) — transitions pending/approved/rejected/reported, autorisation admin, matrice d'enum. `ReviewTest` et `ReviewReportAndDocSearchTest` conservés.

### Hors périmètre (reporté)

- `GET /api/admin/reviews` listing + pagination — non couvert ici, à créer via ticket dédié si besoin produit.
- Notifications admin déclenchées par un seuil — hook placé via statut `reported` mais dispatch d'une notification/job explicite reste à faire (dépend de TCK-022).
- Détection d'avis suspects et badges de réputation — P3 hors périmètre.
