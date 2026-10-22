---
id: TCK-1227
title: "Le bandeau de maintenance relit son statut toutes les 5 minutes pour un visiteur sans session"
status: done
phase: P3
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1221]
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-103--appels-du-navigateur-à-lhydratation-des-pages-publiques"
tags: [front, perf, maintenance, pistes]
---

## Contexte

Réf : **P103.08** du fichier de pistes, `validé`. Entrée dans le lot de l'angle 79 par la
famille : elle cite le même fichier que P79.06, `MaintenanceBanner.tsx`. La décision la rendait
« à faire après la fusion de #939 (P98.10) » : #939 est fusionnée dans `pre-dev` le
2026-10-22 à 00:34 Z (`gh pr view 939`).

`MaintenanceBanner` relit `/api/maintenance/status` toutes les 60 s sur toute page, visiteur
anonyme compris.

## Décision du porteur

« validé — intervalle de 60 s gardé dans la console, porté à 5 minutes pour un visiteur sans session, `refetchOnWindowFocus` laissé actif ; à faire après la fusion de #939 (P98.10) (porteur, 2026-10-22) »

### Lecture retenue

« Visiteur sans session » : `useAuth().user` vaut `null`. Toute session ouverte garde 60 s, qu'elle
soit dans la console ou sur une page publique : la décision ne porte le délai à 5 minutes que pour
le visiteur sans session.

## Objectif

Un onglet public d'un visiteur anonyme interroge le statut cinq fois moins souvent.

## Contrat de données

Aucun.

## Delta à produire

- [x] `refetchInterval` : 60 s avec une session, 5 min sans ; `refetchOnWindowFocus` inchangé.
- [x] Test vitest à minuterie simulée : sans session, aucune relecture à 61 s, une à 5 min ; avec
      session, une à 61 s.

## Critères d'acceptation

- [x] AC1 — Sans session, le statut n'est pas relu avant 5 minutes.
- [x] AC2 — Avec session, il l'est toutes les 60 s.

## Hors périmètre

- La durée du cache du relais (P98.10).

## Notes d'implémentation

- Test à minuterie simulée (`setTimeout`/`setInterval` seulement) et `useAuth` remplacé : le
  bandeau ne lit que `user`.
- Ablation : `MaintenanceBanner.tsx` rendu à l'état de TCK-1221 → 1 rouge (relecture à 61 s sans
  session) ; correctif remis → 2/2 verts, 30/30 sur les tests du bandeau et de la maintenance.
