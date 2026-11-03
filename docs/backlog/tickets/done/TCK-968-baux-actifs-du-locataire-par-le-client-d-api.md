---
id: TCK-968
title: "La check-list d'entrée et la modale de bienvenue lisent les baux actifs par le client d'API, et une garde refuse un `fetch('/api/…')` sans relais"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#la-check-list-dentrée-et-la-modale-de-bienvenue-du-locataire-ne-saffichent-jamais--elles-lisent-apileases-sur-le-serveur-next-qui-na-pas-cette-route"
tags: [front, tenant, onboarding, pistes]
---

## Contexte

Réf : **P48.01** du fichier de pistes, `retenu · autonome` (A1, A5).

Le widget de check-list d'entrée (TCK-266) et la modale de bienvenue du locataire (TCK-265)
lisent ses baux actifs par `fetch('/api/leases?…', { credentials: 'same-origin' })` : un chemin
relatif, donc le serveur Next, qui n'a aucun relais `src/app/api/leases`. La réponse n'est jamais
`ok`, et les deux sortent sans rien afficher. Leurs tests remplacent `fetch` par un faux qui sert
`/api/leases`, et restent verts sans la route.

## Objectif

Le locataire qui a un bail actif voit, sur son accueil, la modale de bienvenue et sa check-list
d'entrée.

## Hypothèses (mode sans humain)

- Les baux actifs se lisent par `useApiQuery` sur `/api/leases` de Laravel, qui rend au locataire
  ses baux par `tenant.user_id` (`LeaseController::index`), avec les mêmes filtre et sparse
  fieldsets que l'appel d'origine (`filter[status]=active`, `fields[leases]=id,reference_number`).
- Les deux sites partagent un seul hook et une seule clé de cache : une seule requête pour
  l'accueil. Le plafond passe à 50 baux pour les deux (le widget en demandait 20, la modale 50).
- `/api/me/welcome-seen` garde son appel au relais BFF, qui existe.

## Delta à produire

- [x] Un hook de lecture des baux actifs du compte dans `src/lib/queries/leases.ts`.
- [x] `TenantOnboardingChecklistWidget` et `useTenantWelcomeOnce` le lisent, au lieu du `fetch`.
- [x] Leurs tests servent les baux par `apiRequest`, et `fetch('/api/leases')` y rend 404, comme
  le serveur Next.
- [x] Garde : un test qui relève tout `fetch('/api/…')` littéral de `src/` et échoue si aucun
  `route.ts` de `src/app/api/` ne le sert.

## Critères d'acceptation

- [x] AC1 — Avec un bail actif servi par l'API et `fetch('/api/leases')` en 404, le widget rend
  sa carte et la modale s'ouvre.
- [x] AC2 — La garde échoue sur un `fetch('/api/leases…')` littéral, et passe sur l'arbre
  corrigé.

## Hors périmètre

- Les appels à l'API Laravel par `apiRequest` (P45.01).
- Les `fetch` dont le chemin n'est pas un littéral commençant par `/api/`.

## Notes d'implémentation

- **Ablation** : le widget et le hook d'avant remis, les trois fichiers de test rendent 6 rouges
  sur 12 (la garde nomme exactement les deux `fetch('/api/leases')`, le widget ne rend pas sa
  carte, la modale ne s'ouvre pas) ; correctif remis, 12 verts.
- **Piège** : la garde lit aussi les commentaires. Un commentaire qui cite le littéral fautif la
  fait rougir ; les commentaires du correctif le décrivent sans l'écrire.
- La file de la modale est désormais dérivée (baux actifs − clés vues − baux écartés pendant le
  montage) au lieu d'un état posé une fois : les deux lectures n'arrivent plus ensemble.
