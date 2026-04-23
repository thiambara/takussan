---
id: TCK-073
title: "Avis — Laisser & répondre publiquement (frontend)"
status: todo
phase: P2
family: front
estimate: M
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-033, TCK-057, TCK-054]
blocks: []
spec_refs:
  features:
    - docs/features.md#111-avis--réputation
  models:
    - docs/models-spec.md#20-review
tags: [reviews, reputation, front]
---

## Contexte

TCK-033 (avis & réputation) est `review` côté backend : endpoints de création, lecture publique, signalement, modération, réponse d'agent/owner. Côté frontend, la fiche bien affiche les avis existants (`PropertyReviews`), et le signalement d'avis inapproprié est câblé. Il manque : **laisser un avis** (customer post-booking/post-lease) et **répondre publiquement** (agent/owner).

## Objectif utilisateur

Après un séjour (booking) ou un bail, un locataire/acheteur doit pouvoir laisser un avis noté sur le bien, l'agent ou l'agence. Un agent ou bailleur doit pouvoir répondre publiquement à un avis reçu, pour nuancer ou remercier.

## Contrat de données

Endpoints à consommer (existants, TCK-033) :

- `POST /api/reviews` — body `{ reviewable_type, reviewable_id, rating, comment, booking_id?, lease_id? }`
- `GET /api/reviews?filter[reviewable_type]=&filter[reviewable_id]=` — liste publique
- `POST /api/reviews/{id}/response` — body `{ response_text }` (agent/owner)
- `PATCH /api/reviews/{id}/response` — éditer sa réponse
- `DELETE /api/reviews/{id}/response` — retirer sa réponse

Sparse fieldsets : `fields[reviews]=id,rating,comment,response_text,moderation_status,created_at,author_id`.

## Direction UX / Artistique

Formulaire "Laisser un avis" à la Airbnb post-stay / Google Reviews. Stars cliquables avec feedback immédiat, zone texte avec compteur de caractères, CTA primary. Réponses affichées sous l'avis original avec visuel hiérarchique clair (indentation + label "Réponse de l'agent"). Ton neutre et professionnel.

## Contraintes strictes (métier)

- Un customer ne peut laisser qu'un seul avis par entité (bien/agent/agence) par booking ou bail (unique composite backend).
- Le customer doit avoir un booking `completed` ou un lease `active/completed` sur le bien pour pouvoir noter.
- Le rating est obligatoire (1 à 5), le commentaire ≥ 10 caractères.
- La réponse publique est réservée à l'agent principal du bien ou à l'owner (policy backend — l'UI ne doit pas contourner).
- Un avis publié passe par `moderation_status=pending` par défaut — visible immédiatement au customer mais signalé dans `/admin/moderation` (TCK-067).

## Delta à produire

- [ ] Formulaire "Laisser un avis" déclenché depuis :
  - Dashboard locataire après un séjour terminé (call-to-action)
  - Page fiche booking `/app/bookings/{id}` si status=completed
  - Page fiche lease `/app/leases/{id}` (pour avis sur bien/agent)
- [ ] Section "Répondre" sur la fiche bien publique `(public)/properties/[slug]` — visible seulement pour agent/owner du bien
- [ ] Liste et édition de ses propres avis dans `/app/profile/reviews` (ou section profil)
- [ ] Tests Vitest : validation formulaire, flow submit, guard booking completed

## Critères d'acceptation

- [ ] AC1 — Un customer dont le booking est completed voit un CTA "Laisser un avis" sur le dashboard ou sur la fiche booking
- [ ] AC2 — Le formulaire exige rating + commentaire ≥ 10 chars ; erreurs 422 mappées
- [ ] AC3 — Tenter de poster un 2e avis sur la même entité/booking bloque avec message clair
- [ ] AC4 — Un agent connecté voyant la fiche bien voit un bouton "Répondre" sous chaque avis non encore répondu
- [ ] AC5 — La réponse publiée s'affiche sous l'avis avec label et date, éditable/suppressible par son auteur
- [ ] AC6 — Un visiteur anonyme voit la réponse publique mais pas les boutons d'action
- [ ] AC7 — `npm run build` + `npm run test` verts

## Hors périmètre

- Modération file d'attente admin (→ TCK-067)
- Détection automatique avis suspects (IA, P3)
- Badges de réputation (P3)

## Notes d'implémentation

_(Rempli à l'implémentation)_
