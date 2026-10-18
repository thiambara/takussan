---
id: TCK-867
title: "Onglets de visites : l'instant de référence arrondi à la minute, pour que le cache serve"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes"
tags: [front, performance, visits, pistes]
---

## Contexte

Réf : **P02.10** du fichier de pistes, `validé` par le porteur (critère accordé : V7). `VisitsList`
calcule `nowIso = new Date().toISOString()` à chaque montage et le passe en `scheduled_at_min` /
`scheduled_at_max` à quatre de ses cinq `useVisits` ; `visitsQueryKeys.list(params)` en fait la clé
de cache. À la milliseconde, chaque montage produit des clés neuves et le cache de TanStack Query
n'est jamais réutilisé.

## Décision du porteur

arrondir `nowIso` à la minute

## Reste à faire

`enabled` limité à l'onglet actif, qui ferait perdre les compteurs

## Objectif utilisateur

L'utilisateur qui revient sur la liste des visites dans la même minute la retrouve depuis le cache,
sans cinq nouvelles requêtes.

## Contrat de données

Aucun changement d'endpoint. `filter[scheduled_at_min]` et `filter[scheduled_at_max]` portent un
instant à la minute (secondes et millisecondes à zéro).

## Delta à produire

- [x] `src/components/visits/VisitsList.tsx` : `nowIso` arrondi à la minute.
- [x] Test : `VisitsList.cle-a-la-minute.tck-867.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Deux montages dans la même minute envoient le même instant aux `useVisits`, à la minute.
- [x] AC2 — Les tests existants de `VisitsList` restent verts.

## Hypothèses

- L'arrondi se fait vers le bas (minute entamée). Une visite prévue dans les 59 secondes passées
  figure alors encore dans « Demandées » ou « Confirmées », et une visite de la minute en cours
  n'est pas dans « Passées » : écart d'au plus une minute, jugé sans effet visible.

## Hors périmètre

- Réserver `enabled` à l'onglet actif (reste du porteur).

## Notes d'implémentation

- Reproduit avant correctif : deux montages à 10:15:07.123 et 10:15:48.901 envoient deux instants
  distincts, à la milliseconde.
- Ablation : `VisitsList.tsx` remis à l'état d'avant → rouge ; remis → vert. Horloge simulée par
  `vi.useFakeTimers({ toFake: ['Date'] })`, pour ne pas figer les attentes de Testing Library.
