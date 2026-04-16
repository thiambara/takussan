---
id: TCK-033
title: Avis & réputation
status: todo
phase: P2
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-16
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

_(à remplir par implementing-specs)_
