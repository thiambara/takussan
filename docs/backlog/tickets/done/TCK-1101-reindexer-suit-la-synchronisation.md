---
id: TCK-1101
title: "Les équipements d'un bien suivent la synchronisation coupée, et le job « neuf » charge d'avance"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1099]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-90--écritures-explicites-dans-lindex-face-aux-transactions-et-à-scout_queue"
tags: [back, recherche, performance, pistes]
---

## Contexte

Réf : **P90.06** du fichier de pistes, `retenu · autonome` (A1 et A2 : la garde
`syncingDisabledFor` suit le contrat que `GeoReindexation` écrit, « coupée, elle ne fait rien » ;
`with()` ne change aucun résultat). Le deuxième point du constat (`MakeSearchable` sous
`SCOUT_QUEUE=true`) a été écarté par le mesureur et n'est pas repris.

- `PropertyTagController` est le seul appelant explicite de l'index qui ne consulte pas
  `ModelObserver::syncingDisabledFor()` : il écrit dans l'index quand la synchronisation est
  coupée (cause de P53.01 sur ce chemin).
- `RefreshNewBuildSearchLabel` réindexe par `Builder::searchable()` sans `with()`.

## Objectif

`Property::reindexer()` (TCK-1099) ne fait rien sous synchronisation coupée, et le job quotidien
charge d'avance l'agence, l'adresse et les étiquettes visibles.

## Delta à produire

- [x] `Property::reindexer()` : retour anticipé si `ModelObserver::syncingDisabledFor(Property::class)`.
- [x] `RefreshNewBuildSearchLabel::handle()` : `with('address', 'tagsVisibles', 'agency')`.
- [x] Tests : synchronisation coupée et moteur injoignable, `POST` et `DELETE` des équipements
      répondent 200/204 ; même nombre de requêtes du job pour 3 et 10 biens.

## Critères d'acceptation

- [x] AC1 — Synchronisation coupée, moteur sur un port fermé : `POST /api/properties/{id}/tags` → 200, `DELETE …/tags/{tag}` → 204.
- [x] AC2 — `RefreshNewBuildSearchLabel::handle()` rend le même nombre de requêtes pour 3 et 10 biens, et les biens de son périmètre sont dans l'index.

## Hors périmètre

- `MakeSearchable` qui ne rejuge pas `shouldBeSearchable()` sous `SCOUT_QUEUE=true` : écarté
  par le mesureur (déduit, non joué ; demanderait de surcharger un job de Scout).

## Notes d'implémentation

- **Écart à la Piste** : le `with()` est posé dans `handle()`, pas dans `scope()`. `scope()` sert
  aussi de périmètre lu par `pluck('id')` dans `RefreshNewBuildSearchLabelTest` ; le résultat de
  la réindexation est le même.
- Le premier test se lit en négatif : sous synchronisation coupée, le moteur est rebranché sur
  `http://127.0.0.1:9`, et toute écriture rendrait 500.
- Avant correctif : 2 rouges (500 au lieu de 200/204, `CommunicationException`), et le job à
  10 requêtes pour 3 biens contre 31 pour 10.
- Ablation : `Property.php` rendu à `HEAD` → les 2 rouges de la synchronisation coupée ;
  `RefreshNewBuildSearchLabel.php` rendu à `HEAD` → le rouge du compte de requêtes ; correctif
  remis → 4 verts.
