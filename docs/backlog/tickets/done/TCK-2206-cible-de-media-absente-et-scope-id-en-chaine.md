---
id: TCK-2206
title: "Une cible de média absente reçoit le refus du tiers, et `scope_id` d'un réglage se compare en entier"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-226--identifiants-de-ligne-cible-reçus-du-client-sur-les-routes-décriture"
tags: [api, media, reglages, oracle, pistes]
---

## Objectif

- `POST /api/media` : une cible absente reçoit le 403 d'une cible tierce, au lieu d'un 404 rendu
  avant toute autorisation.
- `POST /api/settings` (`scope: agency`) : `scope_id` se compare en entier à l'agence de l'appelant.

## Contexte

Réf : **P226.03** du fichier de pistes, `retenu · autonome` (A1).

- `MediaController::store` résolvait la cible par `findOrFail` avant `authorizeAttach()`, et
  `MediaUploadRequest::authorize()` ne demande qu'un compte. Tout compte connecté distinguait donc
  un identifiant absent (404) d'une ligne qu'il ne peut toucher (403), pour toute classe `HasMedia`.
  C'est l'oracle que l'angle 62 a fermé ailleurs (TCK-1066 à TCK-1072).
- `StoreSettingRequest::authorize()` comparait `$user->agency_id === $targetAgencyId` en strict, et
  `scope_id` venait brut d'`input()` : `"12"` refusait en 403 l'admin de l'agence 12.

## Hypothèses (mode sans humain)

- Le super-admin reçoit lui aussi 403 sur une cible absente, comme le fait TCK-1072 pour le bien
  d'une intervention : l'absence ne lui ouvre rien.
- Le front n'appelle pas `POST /api/settings` (relevé du mesureur) : la comparaison en entier ne
  change aucun écran.

## Delta à produire

- [x] `MediaController::store` : `find()` puis `abort_if($target === null, 403)`.
- [x] `StoreSettingRequest::authorize()` : `(int)` des deux côtés.
- [x] `IdentifiantsCiblesDuClientTest`.

## Critères d'acceptation

- [x] AC1 — compte sans lien : `POST /api/media` vers un bien tiers et vers un identifiant absent →
      même statut (403), même corps.
- [x] AC2 — admin d'agence, `scope_id` = son agence en chaîne → 201.
- [x] AC3 — témoin : `scope_id` d'une autre agence, en entier ou en chaîne → 403.

## Notes d'implémentation

- Avant correctif : AC1 (404 contre 403) et AC2 (403) rouges.
- Ablation : les deux correctifs retirés → AC1 et AC2 rouges ; rétablis → 3 verts.
