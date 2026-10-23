---
id: TCK-1777
title: "Les disponibilités du prestataire rendent la projection du `show`, et les contacts sur place gardent en cache la liste écrite"
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
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#onboarding-parcours"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-95--réponse-dune-écriture-face-au-show-du-même-modèle"
tags: [api, front, contrat, prestataire, biens, pistes]
---

## Objectif utilisateur

Après une écriture, l'écran tient ce que l'API a réellement écrit : le prestataire qui enregistre
ses disponibilités reçoit son profil entier, et l'annonceur qui enregistre ses contacts sur place
voit la liste telle qu'elle est en base (libellés rognés), sans attendre une relecture.

## Contexte

Réf : **P95.04** du fichier de pistes, `validé (délégué)`.

Mesuré avant correctif sur `c4adeb298` :

- `PATCH /api/me/profiles/{id}/availability` rend `{id, available_slots}`, là où `show` rend aussi
  `trades`, `intervention_zones`, `hourly_rate`, `visit_fee` (test neuf, rouge sur ces quatre
  chemins).
- `ContactsSurPlaceDuBien` écrit dans le cache la liste **envoyée**, et
  `replacePropertyContactsAction` ne rend que `{ ok: true }` (tests neufs, rouges).

## Décision du porteur (déléguée)

> `ContactsSurPlaceDuBien` écrit dans le cache la réponse de l'API (`r.data`), `replacePropertyContactsAction` rendant cette réponse ; `Me\ServiceProviderProfileController::updateAvailability` rend la même projection que `show` ; `specialization` reste tel quel, écho documenté du champ d'entrée

## Reste à faire

> la forme unique de `ReviewController::moderate` (`204` ou la ressource) et le `data: null` d'`Admin\AgencySubscriptionController::cancel` sans abonnement, au porteur

## Hypothèses (mode sans humain)

- `r.data` est la réponse de `PUT …/contacts` ramenée à la forme de l'éditeur (`label: null` → `''`),
  par la même fonction que la lecture (`versEditeur`, `contacts-du-bien.ts`) : le cache de cette
  clé porte cette forme depuis TCK-633.
- `updateTrades` rend lui aussi une forme réduite (sans `available_slots`) : hors de la décision,
  non touché.

## Delta à produire

- [x] `ServiceProviderProfileController::presenter()`, partagé par `show` et `updateAvailability`.
- [x] `replacePropertyContactsAction` rend `{ ok: true, data }`.
- [x] `ContactsSurPlaceDuBien` écrit `r.data` dans le cache.
- [x] Tests : `ServiceProviderAvailabilityMatchesShowTest`,
  `property-contacts.reponse.tck-1777.test.ts`, un cas dans `ContactsSurPlaceDuBien.test.tsx`.

## Critères d'acceptation

- [x] AC1 — La réponse de `updateAvailability` a la forme du `show` (`FormeDuShow`) et ses valeurs.
- [x] AC2 — L'action rend les lignes que l'API a écrites, et non celles envoyées.
- [x] AC3 — Après l'enregistrement, l'éditeur montre la liste rendue par l'action.

## Notes d'implémentation

- Ablations : `updateAvailability` rendu à `{id, available_slots}` → rouge ; `setQueryData` rendu
  à la liste envoyée → 1 rouge sur 8 ; l'action rendue à `{ ok: true }` → rouge. Remis → verts.
- Les mocks `{ ok: true }` de `ContactsSurPlaceDuBien.test.tsx` portent désormais `data: []`.
  Celui de `PropertyWizard.publication.tck-633.test.tsx` reste `{ ok: true }` : l'assistant ne lit
  que `r.ok`.
