---
id: TCK-1098
title: "Une modération d'équipement ou de quartier se journalise avant la réindexation"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
    - "docs/features.md#24-recherche--filtres"
  models:
    - "docs/models-spec.md#10-tag"
    - "docs/models-spec.md#91-geoneighborhood-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-90--écritures-explicites-dans-lindex-face-aux-transactions-et-à-scout_queue"
tags: [back, recherche, audit, pistes]
---

## Contexte

Réf : **P90.03** du fichier de pistes, `validé (délégué)` (critère accordé : V6, pour la seule
première moitié de la Piste).

Chaque geste de modération valide sa transaction, réindexe ses biens par
`GeoReindexation::biens()`, puis seulement écrit sa ligne `activity_log`. Meilisearch
injoignable, le geste lève après le commit : il est fait en base, et rien ne le trace.

### Décision du porteur (déléguée)

> écrire la ligne `activity_log` avant `GeoReindexation::biens()`, juste après la transaction validée, dans les quatre gestes de `TagModeration` (`approuver`, `rejeter`, `renommer`, `fusionner`), les deux de `GeoNeighborhoodModeration` (`renommer`, `fusionner`) et `TagController::update`, sans rien changer d'autre ; test : client Meilisearch injoignable, chaque geste lève comme aujourd'hui mais sa ligne `activity_log` est écrite ; reste : ne pas laisser l'échec de l'index faire échouer un geste validé (`report()` de l'exception, ou réindexation mise en file après commit par un job qui se relance), au porteur

### Reste à faire

> ne pas laisser l'échec de l'index faire échouer un geste validé (`report()` de l'exception, ou réindexation mise en file après commit par un job qui se relance), au porteur

## Objectif

Les sept gestes écrivent leur ligne d'audit entre le commit et la réindexation.

## Delta à produire

- [x] `TagModeration` : `journaliser()` avant `biens()` dans `approuver`, `rejeter`, `renommer`, `fusionner`.
- [x] `GeoNeighborhoodModeration` : idem dans `renommer` et `fusionner`.
- [x] `TagController::update` : `activity('Admin')` avant la réindexation.
- [x] Test : moteur sur un port fermé, chaque geste lève `CommunicationException` (ou 500 par HTTP) et sa ligne est écrite.

## Critères d'acceptation

- [x] AC1 — Meilisearch injoignable, chacun des sept gestes lève comme avant, et `activity_log` porte une ligne de son événement.
- [x] AC2 — Le contenu des lignes (sujet, auteur, propriétés, événement) ne change pas.

## Hors périmètre

- Le reste de la décision (ci-dessus) : la réponse reste une erreur quand l'index échoue.
- `approuver`/`rejeter` de `GeoNeighborhoodModeration` : ils ne réindexent rien, leur journal
  suit déjà le commit.

## Notes d'implémentation

- Test : `tests/Feature/Search/ModerationMoteurInjoignableTest.php`, 7 cas. Le moteur est
  rebranché sur `http://127.0.0.1:9` **après** la création des données, et
  `Property::enableSearchSyncing()` est rallumé : sinon `GeoReindexation` ne fait rien (suite
  coupée par `Tests\TestCase`) et le test passerait sans rien garder. Les biens sont publiés :
  `biens()` filtre par `shouldBeSearchable()`, et une collection vide n'appelle pas le moteur.
- Ablation : les trois fichiers d'`app/` rendus à `HEAD` → 7 rouges (« 0 is identical to 1 ») ;
  correctif remis → 7 verts.
