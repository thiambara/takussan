---
id: TCK-1515
title: "« Avis sans réponse » du bailleur ouvre la boîte sur les avis de biens sans réponse"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-167--tuiles-et-lignes-cliquables-des-tableaux-de-bord--ce-que-le-lien-ouvre-face-à-ce-que-le-nombre-compte"
tags: [front, dashboard, reviews, pistes]
---

## Contexte

Réf : **P167.02** du fichier de pistes, `retenu · autonome` (A1).

« Avis sans réponse » de l'aperçu du bailleur compte les avis approuvés, sans réponse, portés sur
ses biens (`DashboardOwnerService.php:117-123`) ; le lien mène à `/app/profile/reviews` nu, et la
boîte `ReceivedReviewsInbox` tient ses filtres en `useState(ALL)` sans lire l'URL : le clic ouvre
tous les avis reçus.

## Hypothèse (mode sans humain)

La Piste laisse les noms des paramètres « à choisir sur ceux de la boîte ». Retenu : `?reply=` et
`?subject=`, dont les valeurs sont celles des options des filtres « Réponse » (`unreplied`,
`replied`) et « Sujet » (`property`, `agent`, `agency`, `service_provider`). Une valeur hors des
options est ignorée.

## Objectif utilisateur

Le bailleur qui clique « Avis sans réponse » arrive sur les avis de ses biens qui attendent sa
réponse.

## Delta à produire

- [x] `overview/owner/page.tsx` : le lien porte `?reply=unreplied&subject=property`.
- [x] `ReceivedReviewsInbox` : `?reply=` et `?subject=` initialisent les deux filtres, bornés à leurs options.

## Critères d'acceptation

- [x] AC1 — le `href` de la ligne est `/app/profile/reviews?reply=unreplied&subject=property`.
- [x] AC2 — la boîte montée sur ces paramètres envoie `filter[replied]=0` et
  `filter[subject_type]=property`, et le filtre « Réponse » affiche « Sans réponse ».
- [x] AC3 — une valeur inconnue n'envoie aucun de ces deux filtres.

## Hors périmètre

- Le compte ne prend que les biens dont le bailleur est titulaire, la boîte montre aussi ceux dont
  il est collaborateur (relevé par le mesureur, non mesuré sur un jeu) : écart que le lien ne comble pas.
- Les filtres ne s'écrivent pas dans l'URL quand on les change.

## Notes d'implémentation

- Ablation : `ProfileReviewsList.tsx` et `overview/owner/page.tsx` rendus à `pre-dev` → les deux
  tests neufs rouges (`href` nu, requête sans `filter[replied]`) ; remis → verts.
- `ProfileReviewsList.test.tsx` ne montait pas le routeur : il moque désormais `next/navigation`.
