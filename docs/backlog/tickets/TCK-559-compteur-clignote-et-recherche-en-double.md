---
id: TCK-559
title: "Liste des biens : le compteur servi par le serveur repasse par « Chargement… », et une seconde requête de recherche part après l'hydratation"
status: todo
phase: P2
family: technique
estimate: S
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models: []
tags: [front, perf, hydratation, recherche]
---

## Objectif utilisateur

Un visiteur qui arrive sur la liste voit le nombre de biens et les cartes stables dès le premier
affichage, sans clignotement ni grille qui se grise.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constat P9), sur `/fr/properties?contract_type=rent&q=Dakar`.

- Le HTML servi contient déjà `aria-live="polite">140 biens trouvés` (TCK-432 : résultats semés par
  le serveur).
- Côté navigateur, relevé par `MutationObserver` : « Chargement… » à 444 ms, puis « 140 biens
  trouvés » à 628 ms.
- `performance.getEntriesByType('resource')` montre ensuite une requête
  `/api/public/properties/search?contract_type=rent&q=Dakar&per_page=30` à 698 ms — la recherche
  que le serveur venait d'exécuter. Hypothèse, **non vérifiée** : la clef semée (`clefDeRecherche`)
  ne porte pas `per_page` quand le client l'ajoute ; les deux clefs diffèrent et la graine est
  écartée.

⚠ **Mesuré sous `next dev`**, dont l'hydratation n'est pas celle de la production (revue adverse).
Le premier critère d'acceptation est donc une re-mesure : si rien ne se reproduit sous
`next build && next start`, le ticket passe `obsolete` avec la mesure.

## Contrat de données

Aucun changement d'API. `GET /api/public/properties/search`, même requête côté serveur et client.

## Direction UX / Artistique

- Le premier affichage est l'affichage final : pas d'état de chargement pour des données déjà
  présentes.

## Contraintes strictes (métier)

- Une graine n'est réutilisée que si l'URL décrit **la même requête** (docblock de `page.tsx`,
  TCK-432) : ne pas corriger en réutilisant la graine plus largement.
- Une seule chaîne pour une requête (`lib/recherche-publique.ts`) : pas de seconde fabrique de clef.

## Delta à produire

- [ ] Re-mesure sous `next build && next start` (compteur et requêtes réseau), consignée dans les
      notes.
- [ ] Si reproduit : cause établie, clefs serveur et client alignées, sans élargir la réutilisation.
- [ ] Test : la clef semée et la clef calculée côté client sont égales pour une URL sans `per_page`
      et pour une URL avec `per_page=30` explicite.

## Critères d'acceptation

- [ ] AC1 — la re-mesure en build de production est consignée (texte du compteur dans le temps,
      requêtes `/search` après chargement).
- [ ] AC2 — sous build de production, `/fr/properties?contract_type=rent&q=Dakar` n'émet **aucune**
      requête `/api/public/properties/search` dans les 3 s qui suivent le chargement.
- [ ] AC3 — le compteur ne passe jamais par « Chargement… » au premier affichage.
- [ ] AC4 — changer un filtre déclenche toujours une requête (la graine n'est pas réutilisée pour
      une autre requête).

## Hors périmètre

- Les trois appels à `/api/public/property-types` relevés au même chargement (à mesurer à part).
- Le squelette de la frontière de suspension (TCK-432, choix documenté).

## Notes d'implémentation

_(à remplir par implementing-specs)_
