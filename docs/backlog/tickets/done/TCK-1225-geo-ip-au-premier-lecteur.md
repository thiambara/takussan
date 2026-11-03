---
id: TCK-1225
title: "`UserLocationProvider` ne joint ipapi.co qu'au premier lecteur de la ville devinée"
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
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-103--appels-du-navigateur-à-lhydratation-des-pages-publiques"
tags: [front, perf, privacy, pistes]
---

## Contexte

Réf : **P103.05** du fichier de pistes, `validé`. Entrée dans le lot de l'angle 79 par la
famille : elle cite le même fichier, `src/app/layout.tsx`.

`UserLocationProvider`, monté par la mise en page racine, appelle `https://ipapi.co/json/` dès son
montage sur toute page dont le `localStorage` n'a pas de réponse de moins de 24 h, alors que quatre
écrans seulement lisent `useUserLocation()`.

## Décision du porteur

« validé — (a) : la résolution par ipapi.co ne part qu'au premier abonnement d'un lecteur de la ville devinée, cache de 24 h gardé ; garde : un test vitest qui monte le fournisseur sans lecteur et exige qu'aucun `fetch` vers `ipapi.co` ne parte (porteur, 2026-10-22) »

Critère accordé : V3 (dernier classement du mesureur).

### Choix de l'implémenteur

La piste offrait deux formes de démarrage ; la décision (a) en retient le principe. Forme retenue,
la plus étroite pour les appelants : **le crochet la déclenche**. `useUserLocation()` demande la
résolution au montage ; aucun des quatre lecteurs ne change.

## Objectif

Une page sans lecteur de la ville devinée n'envoie pas l'IP du visiteur à ipapi.co.

## Contrat de données

Aucun.

## Delta à produire

- [x] Le fournisseur ne résout qu'après une demande ; `useUserLocation()` la fait au montage.
- [x] Test vitest : fournisseur sans lecteur → aucun `fetch` vers ipapi.co ; avec un lecteur → un
      seul, et la ville rendue ; cache de 24 h → aucun `fetch`.

## Critères d'acceptation

- [x] AC1 — Monté sans lecteur, le fournisseur n'appelle pas ipapi.co.
- [x] AC2 — Au premier lecteur, la résolution part une fois, et le cache de 24 h est gardé.

## Hors périmètre

- Le texte de la politique de confidentialité.

## Notes d'implémentation

- `demarrer` est idempotent (`setDemandee(true)`) : deux lecteurs, un seul appel, ce que le test
  exige.
- Ablation : `UserLocationProvider.tsx` rendu à `HEAD` → 1 rouge (un appel à ipapi.co sans
  lecteur) ; correctif remis → 3/3 verts, 101/101 avec les tests des quatre lecteurs.
