---
id: TCK-1229
title: "La barre publique ne demande les comptes par type qu'à la première ouverture du menu « Plus »"
status: todo
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
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-103--appels-du-navigateur-à-lhydratation-des-pages-publiques"
tags: [front, perf, pistes]
---

## Contexte

Réf : **P103.04** du fichier de pistes, `validé (délégué)`. Entrée dans le lot par la famille de
l'angle 103 (P103.02, P103.05, P103.08 y sont déjà).

La `Navbar` publique appelle `apiFetch('/public/property-types')` à chaque montage, sur toutes les
pages, pour des comptes qu'elle n'affiche que dans le menu « Plus », fermé par défaut et absent
sous 1 024 px.

## Décision du porteur (déléguée)

« validé (délégué) — demander les comptes à la première ouverture du menu « Plus » (`useApiQuery` ou `useQuery` avec `enabled: moreOpen` et le `staleTime` de `referentiel-public.ts`) ; le menu reste rendu sans comptes tant qu'ils ne sont pas là, comme aujourd'hui sur un échec ; garde : un test vitest qui rend la `Navbar` menu fermé et exige qu'aucun appel à `property-types` ne parte ; reste : la voie du rendu serveur »

Choix entre les deux formes permises : `useQuery` sur `apiFetch`, l'appel public existant (sans
jeton ni `Content-Type`), la clé rangée sous `referentielPublicQueryKeys`, `staleTime` d'une heure
comme le référentiel. `enabled` reste vrai une fois le menu ouvert, pour que sa fermeture ne
fasse pas oublier les comptes.

## Reste à faire

la voie du rendu serveur

## Objectif

Une page publique dont le visiteur n'ouvre pas le menu « Plus » ne demande pas les comptes.

## Contrat de données

Aucun : `GET /api/public/property-types` inchangé.

## Delta à produire

- [ ] `referentiel-public.ts` : `UNE_HEURE_MS` exportée et une clé `typesDeBien()`.
- [ ] `Navbar` : `useQuery` activé à la première ouverture du menu, à la place de l'effet de montage.
- [ ] Test vitest : menu fermé → aucun appel à `property-types` ; menu ouvert → un appel, et les
      comptes affichés.

## Critères d'acceptation

- [ ] AC1 — `Navbar` rendue menu fermé : aucun appel à `property-types`.
- [ ] AC2 — À l'ouverture, les comptes arrivent ; le menu s'affiche sans eux d'ici là.

## Hors périmètre

- Le cache HTTP de la route (P103.03).

## Notes d'implémentation

_(à remplir par implementing-specs)_
