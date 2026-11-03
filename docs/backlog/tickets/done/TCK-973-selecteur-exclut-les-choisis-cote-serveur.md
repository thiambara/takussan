---
id: TCK-973
title: "Le sélecteur de participants exclut les choisis côté serveur, et ne charge que l'avatar"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-28"
tags: [back, front, messaging, pistes]
---

## Objectif utilisateur

Dans le sélecteur de participants, « {shown} sur {total} » et la liste vide disent vrai quand des
personnes sont déjà choisies, et la liste ne lit plus que l'avatar de chaque contact.

## Contexte

Réf : **P51.06** du fichier de pistes, `validé (délégué)` (critère V7 accordé pour le compteur ;
la partie `media` relève de A2).

Mesuré avant correctif, par les tests de garde ci-dessous sans le correctif : cinq choisis parmi
trente contacts → quinze lignes sous « 20 sur 30 » ; vingt choisis en tête → aucune option, alors
que dix autres sont joignables. Côté API, `GET /api/conversations/contacts` lisait les lignes
`media` de toutes les collections (`select * from "media" where "media"."model_id" in (…) and
"media"."model_type" = ?`, sans `collection_name`), et refusait `filter[exclude]` en 400.

## Décision du porteur (déléguée)

> `with(['media' => fn ($q) => $q->where('collection_name', 'avatar')])` ; exclure les choisis côté serveur par `filter[exclude]` (ids des choisis et `excludeIds`), appliqué avant la pagination, pour que « {shown} sur {total} » et la liste vide lisent la réponse ; un test du composant avec des choisis dans la page

## Hypothèses (mode sans humain)

- `filter[exclude]` vaut pour les deux portes (`/contacts` et `/{conversation}/contacts`), qui
  partagent `contacts()`. Un identifiant illisible (non entier, ≤ 0) n'exclut rien et ne rend pas
  d'erreur : le filtre ne fait que retirer des lignes, il n'ouvre rien.
- Le filtre local du sélecteur reste, pour la fenêtre où `placeholderData` montre encore la page
  précédente (choisi compris).
- Les identifiants exclus entrent triés dans la clé de requête : un même ensemble fait une même clé.

## Delta à produire

- [x] API — `MessagingContactController::contacts()` : `media` restreint à `avatar` ; filtre
  `exclude` (`whereNotIn` sur `users.id`) avant la pagination.
- [x] Front — `useMessagingContacts(…, { exclude })` envoie `filter[exclude]` et l'ajoute à la clé ;
  `ParticipantPicker` lui passe les choisis et `excludeIds`.
- [x] Tests : `MessagingContactsTest` (`filter[exclude]`, collection `avatar`) ;
  `ParticipantPicker.test.tsx` (nouveau).

## Critères d'acceptation

- [x] AC1 — `filter[exclude]=a,b` retire `a` et `b` avant la pagination : `meta.total` ne les
  compte pas ; `filter[exclude]=abc` → 200, rien d'exclu.
- [x] AC2 — une seule requête `media`, filtrée sur `collection_name`, et `avatar_url` reste rendu.
- [x] AC3 — cinq choisis sur trente → `filter[exclude]` porte leurs ids et `excludeIds`, 20 options,
  « 20 sur 25 — précisez la recherche ».
- [x] AC4 — vingt choisis en tête → les dix suivants sont proposés, sans « Personne ne correspond ».
- [x] AC5 — sans choisi, aucun `filter[exclude]` ne part.

## Hors périmètre

- Quand toutes les personnes joignables sont choisies, la liste dit « Vous n'avez encore personne à
  inviter. » (total à 0 sans recherche) : un texte propre à ce cas serait un texte neuf (V7).

## Notes d'implémentation

- Ablation API : `with('media')` remis → 1 rouge (requête sans `collection_name`) ; le `whereNotIn`
  retiré → 1 rouge (`meta.total` à 4) ; remis → 22 verts.
- Ablation front : `filter.exclude` retiré du hook → 2 rouges (AC3, AC4) ; remis → 3 verts.
- Piège de montage : une ligne `media` sans `conversions_disk` fait lever `getUrl('thumbnail')`
  (`getDiskName()` rend `null`) — le test la renseigne.
