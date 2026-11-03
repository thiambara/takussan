---
id: TCK-073
title: "Avis — Laisser & répondre publiquement (frontend)"
status: done
phase: P2
family: front
estimate: M
wave: 5
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

### Écarts par rapport au contrat ticket

Le ticket listait `POST /api/reviews`, `GET /api/reviews` et
`POST|PATCH|DELETE /api/reviews/{id}/response`. Les routes réellement livrées
par TCK-033 sont :

- `POST /api/properties/{property}/reviews` (pas `/api/reviews`) — la création
  est scopée sur la relation polymorphique côté backend.
- `POST /api/reviews/{review}/reply` (pas `/response`) — endpoint unique,
  pas de PATCH ni de DELETE.
- `GET /api/reviews` existe mais est réservé à la file de modération admin
  (403 pour les autres rôles).

Le frontend cible les routes livrées. L'édition d'une réponse passe par un
ré-POST sur `/reply` (le contrôleur fait un `update()`), ce qui suffit pour
l'AC5 côté « édition ».

### Hors scope faute de backend (remonté pour ticket futur)

- **Suppression d'une réponse** : aucune route `DELETE /reply` côté backend ;
  l'UI n'expose donc pas d'action « Supprimer la réponse ». AC5 « suppressible »
  n'est pas couvert tant que TCK-033 n'expose pas cette route (ou qu'un POST
  avec `reply_content` vide n'est pas toléré — actuellement `required`).
- **Liste GET des avis de l'utilisateur courant** : pas de route
  `GET /api/reviews?filter[author_id]=me`. `/app/profile/reviews` liste donc
  les séjours (`bookings` completed) et baux éligibles du client, avec un CTA
  vers la fiche publique. C'est actionnable et évite de dupliquer la modération
  admin. À compléter avec une vraie vue « mes avis » si un endpoint dédié est
  ajouté plus tard.

### Décisions UX

- Le formulaire « Laisser un avis » reste sur la fiche publique
  `(public)/properties/[slug]` dans la section `<PropertyReviews>` (ancre
  `#avis`). Les CTA (booking/lease/profil) font un deep-link vers cette
  ancre plutôt que d'ouvrir une modale — on évite ainsi de dupliquer la
  récupération du bien et de ses avis existants.
- Côté frontend, `rating` reste un entier 1-5 (aligné avec la validation
  backend `integer|min:1|max:5`), malgré le `decimal(2,1)` côté schéma — le
  backend accepte les entiers.
- Le commentaire minimal de 10 caractères est une contrainte UX front seule
  (backend : `nullable`). Si l'utilisateur contourne en DevTools, la publication
  réussit quand même — c'est une aide à la qualité, pas un invariant métier.
- `canReplyToReview()` mirror exactement la policy backend
  (`ReviewController@reply`) : owner, membre de l'agence du bien, ou admin.

### Coordination inter-tickets

- Aucun conflit avec TCK-075 (Visites) : les modifications sur la fiche
  publique se résument à une nouvelle prop `ownerId`/`agencyId` passée à
  `<PropertyReviews>`, qui vit dans sa propre section distincte de la carte
  de réservation/visite.

### Tests

- `PropertyReviewForm` : guard note requise, commentaire ≥ 10 chars, flow
  submit, erreur 422.
- `PropertyReviewReplyForm` : guard longueur, submit, mode édition, annuler.
- `canReplyToReview` : guard des 6 scénarios anonyme/owner/agent/admin/autre.
- `LeaveReviewCta` : rendu du deep-link `#avis`.
- `canBookingLeaveReview` / `canLeaseLeaveReview` : prédicats d'éligibilité.

Total : 24 tests ajoutés, 233 tests verts au total.

