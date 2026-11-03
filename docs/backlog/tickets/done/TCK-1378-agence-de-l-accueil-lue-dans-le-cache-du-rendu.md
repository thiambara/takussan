---
id: TCK-1378
title: "`fetchAgencyAction` lit l'agence par la requête mise en cache du rendu"
status: done
phase: P2
family: technique
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
tags: [web, performance, agence, pistes]
---

## Contexte

Réf : **P138.05** du fichier de pistes, `retenu · autonome` (A1 : la décision écrite de P105.05,
« lire l'agence par `agenceDuRendu` exposée avec son erreur », s'applique à `fetchAgencyAction`).
L'accueil `/app` d'un admin d'agence portait deux `GET /api/agencies/{id}` identiques : le layout
par `resolveAgencyOrNull` (sous `cache()`), la page par `fetchAgencyAction` (hors cache).

## Delta à produire

- [x] `lireAgenceDuRendu` exportée par `server-guards.ts` : `agenceDuRendu`, avec son erreur.
- [x] `fetchAgencyAction` lit par elle ; son contrat (`ActionResult`, message de l'API) est inchangé.
- [x] Garde : `src/app/actions/__tests__/admin-agency.agence-du-rendu.tck-1378.test.ts`.

## Critères d'acceptation

- [x] AC1 — `resolveAgencyOrNull` + `fetchAgencyAction` dans un rendu : un seul `fetchAgency`.
- [x] AC2 — Une erreur de l'API reste rendue à la page avec son statut.

## Hors périmètre

- L'entrée P105.05 (angle impair, autre instance) : ce correctif couvre aussi `/app/agency`, qui
  lit par `fetchAgencyAction`, mais son test de page et son entrée restent à elle.

## Notes d'implémentation

- Ablation : `fetchAgencyAction` rendu à `fetchAgency` direct → 1 rouge (`called 2 times`) ;
  remis → 2 verts.
