---
id: TCK-1781
title: "Un avis d'auteur effacé ou sans nom : l'API rend `author.name` nul, le front écrit « Anonyme » dans la langue du lecteur"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
  models:
    - "docs/models-spec.md#11-review"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-175--relations-vers-un-compte-supprimé-en-douceur-par-la-suppression-de-compte"
tags: [api, web, avis, i18n, pistes]
---

## Objectif utilisateur

Le lecteur anglais d'un avis dont l'auteur a effacé son compte, ou n'a pas de nom, lit
« Anonymous », et non le « Anonyme » français que l'API écrivait en dur.

## Contexte

Réf : **P175.05** du fichier de pistes, `retenu · autonome` (A1 : principe 5 de `CLAUDE.md`, le
front possède le texte affiché).

Mesuré avant correctif sur `5f3714e6f` : `GET /api/public/properties/{slug}/reviews` rend
`data.0.author.name = "Anonyme"` pour un auteur supprimé en douceur, et pour un auteur sans
prénom, nom ni `username`. Côté front, `PropertyReviews` lit `review.author.name.charAt(0)` et
`ReviewsSection` `name.trim()` : un `name` nul les ferait tomber.

## Hypothèses (mode sans humain)

- Le repli réutilise la clé existante `publicProfile.reviews.anonymous` (fr « Anonyme », en
  « Anonymous ») sur les fiches publiques. La boîte des avis reçus (`ProfileReviewsList`, sous
  `/app`) prend une clé `profile.reviews.anonymous` au même texte : y lire `publicProfile` aurait
  envoyé tout cet espace à la console (`check:i18n-namespaces` rouge). En `wo`, le texte français
  tel quel (wolof en pause).
- Le repli sur `username` est gardé ; une chaîne vide y vaut absence.
- `ModerationDetail` et `ModerationQueueList` écrivaient déjà `author?.name ?? t(…)` : inchangés.

## Hors périmètre

- Le chargement de `author` par `whenLoaded` : la `Mesure` du mesureur l'a établi caduc (toutes
  les lectures en liste chargent `author`).
- Le volet `swapProvider()` de la Piste (relire le prestataire sortant par `withTrashed()`) :
  laissé en reste, voir l'entrée du fichier de pistes. `withTrashed()` seul ne change rien : le
  test d'appartenance et `GroupConversationService::removeParticipant()` passent eux aussi par
  `participants()`, dont la portée `SoftDeletes` cache le compte effacé ; le retirer pour de bon
  poste dans le fil un message « a retiré … » au nom de repli `deleted-<id>@takussan.local`
  (`SystemMessageFactory::displayName`), ou le fait sortir sans message — un choix visible.

## Delta à produire

- [x] `ReviewResource` rend `author.name` nul pour un auteur absent ou sans nom.
- [x] Types du front (`types/review.ts`, `lib/queries/reviews.ts`, `PublicReview`) : `name: string | null`.
- [x] `PropertyReviews`, `ReviewsSection`, `ProfileReviewsList` écrivent le repli traduit ;
  clé `profile.reviews.anonymous` ajoutée (fr, en, wo = fr).
- [x] Gardes : `tests/Feature/Public/ReviewAuthorNameTest.php` ; côté front
  `PropertyReviews.auteur-anonyme.tck-1781.test.tsx`, `ReviewsSection.auteur-anonyme.tck-1781.test.tsx`,
  un cas dans `ProfileReviewsList.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Auteur supprimé en douceur → `author.name` nul.
- [x] AC2 — Auteur sans prénom, nom ni `username` → `author.name` nul, `author.id` rendu.
- [x] AC3 — Auteur nommé → `author.name` = son nom complet.
- [x] AC4 — Les trois vues écrivent « Anonyme » en français, « Anonymous » en anglais, sans lever.

## Notes d'implémentation

- Ablation API : `ReviewResource` d'origine → 2 rouges sur 3 (`'Anonyme' is identical to null`) ;
  rétabli → vert.
- Ablation front : les trois composants d'origine → 5 rouges sur 16 (`reading 'charAt'`,
  `reading 'trim'`, texte absent) ; rétablis → vert.
- Piège : `Conversation::participants()` passe par le modèle `User` et cache un compte effacé ;
  un test qui lit les participants actifs par elle reste vert même quand la ligne pivot est
  active. C'est ce qui a fait sortir le volet `swapProvider()` du ticket.
