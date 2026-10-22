---
id: TCK-1376
title: "Vue agent : les capacités se lisent par la lecture mémoïsée du rendu, sous le profil actif"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-138--lectures-de-lapi-dédoublées-dans-un-même-rendu-serveur"
tags: [web, dashboard, capacites, pistes]
---

## Contexte

Réf : **P138.07** du fichier de pistes, `validé`. En `agency_admin`, `/app/overview/agent` lisait
`GET /api/me/capabilities` deux fois : par `capacitesDuRendu` (layout, avec l'indice de profil) et
par `fetchMyCapabilities` (page, sans indice), qui décidait de la bascule « Agence ».

## Décision du porteur

> validé — porteur (2026-10-22) : la page lit les capacités par la lecture mémoïsée qui porte l'indice (`capacitesDuRendu`), et `fetchMyCapabilities` est retiré s'il n'a plus d'appelant

## Delta à produire

- [x] `capacitesDuProfilActif()` exposée par `pages-admin-server.ts`, sur `capacitesDuRendu`.
- [x] La page agent la lit ; `fetchMyCapabilities` retiré (plus d'appelant).
- [x] Les trois tests de la page mockent la nouvelle lecture.
- [x] Garde : `overview/__tests__/agent-capacites-du-rendu.tck-1376.test.tsx`.

## Critères d'acceptation

- [x] AC1 — La page lit les capacités avec l'indice du profil actif.
- [x] AC2 — `accesAdmin` + la page : une seule lecture des capacités par rendu.
- [x] AC3 — Une panne de lecture : pas de bascule, vue personnelle.

## Hypothèses

- La décision ne dit pas que faire de `null` (panne), que `fetchMyCapabilities` rendait `[]`. Choix
  le plus étroit : `null` vaut l'absence de la capacité, comme avant (bascule masquée, vue
  personnelle) ; la panne est désormais journalisée par `capacitesDuRendu`.

## Notes d'implémentation

- Ablation : `capacitesDuProfilActif` sans indice → 2 rouges sur 3 (indice absent, deux lectures
  car la clé du cache diffère) ; remis → 3 verts, 33 avec les tests voisins.
