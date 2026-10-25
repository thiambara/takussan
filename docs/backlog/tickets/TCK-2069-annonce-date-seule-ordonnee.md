---
id: TCK-2069
title: "Une date d'annonce modifiée seule se juge contre l'autre date enregistrée"
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
  features:
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#46-announcement-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-209--requêtes-de-modification-qui-ne-rejouent-pas-les-règles-de-la-création"
tags: [api, super-admin, annonces, validation, pistes]
---

## Objectif

`PATCH /api/admin/announcements/{id}` refuse en 422 un `ends_at` envoyé seul avant le début
enregistré, et un `starts_at` envoyé seul après la fin enregistrée.

## Contexte

Réf : **P209.04** du fichier de pistes, `retenu · autonome` (A1).

- `UpdateAnnouncementRequest` garde `after:starts_at` sur `ends_at`, avec `starts_at` en
  `sometimes` : quand le début manque à la requête, la règle ne compare à rien. Une annonce à
  fin avant début ne passe jamais `scopeCurrentlyVisible`, sans que la console le dise.

## Hypothèses (mode sans humain)

- Les deux dates envoyées ensemble restent jugées par la règle partagée avec la création.
- Une fin à `null` (sans fin) laisse le début libre.
- Le message est celui de Laravel (`validation.after`, `validation.before`), comme la règle
  `after:` qu'il prolonge.

## Delta à produire

- [x] `UpdateAnnouncementRequest::after()` : la date envoyée seule comparée à l'autre date de
  l'annonce.
- [x] `AnnouncementTest` : chaque date seule de part et d'autre de la valeur enregistrée.

## Critères d'acceptation

- [x] AC1 — Annonce du 2026-12-01 au 2026-12-31 : `PATCH {ends_at: 2026-11-01}` → 422 sur
  `ends_at`, `PATCH {starts_at: 2027-06-01}` → 422 sur `starts_at`, ligne inchangée.
- [x] AC2 — Une date seule du bon côté passe (200), et une fin effacée libère le début.

## Hors périmètre

- Le formulaire de la console super-admin, non relu : la voie est celle de l'API.

## Notes d'implémentation

- Avant correctif : `PATCH {ends_at: 2026-11-01}` rend 200.
- Ablation : `after()` rendu vide → 1 rouge ; remis → 12 verts.
