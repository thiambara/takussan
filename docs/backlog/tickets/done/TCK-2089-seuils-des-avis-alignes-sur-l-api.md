---
id: TCK-2089
title: "La fiche de bien et « Mes avis » jugent le contenu et la réponse d'un avis par les mêmes seuils, ceux de l'API"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-1891, TCK-1897]
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-195--seuils-de-saisie-recopiés-en-constantes-du-front-face-à-la-règle-de-lapi"
tags: [front, avis, parite, pistes]
---

## Objectif utilisateur

Une réponse ou un avis accepté par un écran l'est aussi par l'autre : une réponse de 1500
caractères écrite depuis « Mes avis » se rouvre et se complète depuis la fiche du bien, et un avis
sans commentaire se publie depuis la fiche comme depuis « Mes avis ».

## Contexte

Réf : **P195.05** du fichier de pistes, `validé`.

Décision du porteur : validation du porteur (2026-10-23) : la recommandation du délégué : un maximum unique de 2000, minimums alignés sur l'API

La recommandation du délégué (ligne `Mesure` du 2026-10-23, 0303e7d79) : les deux écrans relisent
le maximum de l'API posé par P195.04 (2000 pour le contenu et pour la réponse) ; pour les minimums,
la règle de l'API — non vide pour la réponse, rien pour le contenu.

Règles de l'API (lu) :
- `ReplyReviewRequest.php:25` — `'reply_content' => ['required', 'string', 'max:2000']` ;
- `StoreForPropertyReviewRequest.php:53` et `StoreForAgencyReviewRequest.php:49` —
  `'content' => ['nullable', 'string', 'max:2000']`.

Avant (lu) : la fiche exige 5 caractères et en permet 1000 pour une réponse
(`PropertyReviewReplyForm.tsx:16-17`), 10 caractères pour un avis (`PropertyReviewForm.tsx:15`) ;
« Mes avis » accepte une réponse non vide et un avis sans commentaire, jusqu'à 2000 en littéral
(`ProfileReviewsList.tsx:259,557`).

## Hypothèses (mode sans humain)

- Les seuils vivent dans un module sans directive (`src/lib/review-limits.ts`), lu par les deux
  écrans et comparé à l'API par `seuils-de-saisie.parity.test.ts` (TCK-1897).
- Aucun texte neuf : le champ d'avis de la fiche reprend le texte déjà écrit de
  `profile.reviews.opportunityCommentLabel` (« Votre commentaire (facultatif) »), et une réponse
  vide celui de `profile.reviews.replyRequired` (« Écrivez une réponse avant de publier. »),
  recopiés sous `property.reviews.form.contentOptionalPlaceholder` et
  `property.reviews.replyForm.contentRequired` (`wo` = le français, wolof en pause) : la fiche est
  sous la frontière publique, qui ne charge pas l'espace `profile`. Les clés devenues sans lecteur
  (`property.reviews.form.contentPlaceholder`, `contentTooShort`, `charsLeft`,
  `property.reviews.replyForm.contentTooShort`) sont retirées des trois langues.
- Un avis sans commentaire part sans `content` (comme le titre), plutôt qu'avec une chaîne vide.

## Delta à produire

- [x] `takussan-web/src/lib/review-limits.ts` : `REVIEW_CONTENT_MAX`, `REVIEW_REPLY_MAX`.
- [x] `PropertyReviewReplyForm` : réponse non vide, 2000 au plus.
- [x] `PropertyReviewForm` : plus de minimum sur le contenu, 2000 au plus.
- [x] `ProfileReviewsList` : les deux `maxLength={2000}` lisent les constantes.
- [x] Paires de parité : contenu d'un avis de bien et d'agence, réponse.

## Critères d'acceptation

- [x] AC1 — Depuis la fiche, une réponse rouverte de 1500 caractères se complète (`maxLength` 2000),
  et une réponse d'un caractère se publie.
- [x] AC2 — Depuis la fiche, un avis noté sans commentaire se publie, sans `content`.
- [x] AC3 — Le test de parité compare les trois bornes à leur règle PHP.

## Reste à faire

- L'avis d'agent et de prestataire (5000 à l'API, 2000 au front) reste le reste de P195.04, non
  repris ici.

## Hors périmètre

- Tout seuil d'un autre champ de l'angle 195.

## Notes d'implémentation

- **Ablation** : composants de la fiche remis à leur version d'avant (`REPLY_MIN = 5`,
  `REPLY_MAX = 1000`, `REVIEW_CONTENT_MIN = 10`) et `REVIEW_REPLY_MAX` à 1000 → 8 rouges sur 25
  (réponse d'un caractère refusée, `maxLength` 1000, avis sans commentaire refusé, paire
  « réponse à un avis » 1000 ≠ 2000) ; correctif remis → 25 verts.
- **Piège** : le libellé du champ d'avis portait le minimum (« min. 10 caractères ») : il ne
  pouvait pas rester. Le champ reprend le texte de « Mes avis ». Lire directement l'espace
  `profile` depuis la fiche faisait rougir `check:i18n-namespaces` (frontière publique : la clé se
  serait affichée brute) ; le texte est donc recopié sous `property.reviews`.
