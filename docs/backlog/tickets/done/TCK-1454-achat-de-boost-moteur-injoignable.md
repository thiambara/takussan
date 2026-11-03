---
id: TCK-1454
title: "Meilisearch injoignable : l'achat d'un boost est écrit et répond 201, l'échec d'index est rapporté"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1452]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-90--écritures-explicites-dans-lindex-face-aux-transactions-et-à-scout_queue"
tags: [back, recherche, boost, credits, pistes]
---

## Contexte

Réf : **P90.04** du fichier de pistes.

`BoostPurchaseService::purchaseOnce()` verrouille l'agence et le bien, débite, puis écrit le bien
par `BoostLifecycle::writeProperty()`, qui appelait Meilisearch avant le commit sous
`SCOUT_QUEUE=false`. Moteur injoignable : `CommunicationException`, la transaction entière était
annulée, et une panne de la recherche refusait une dépense de crédits.

TCK-1452 (P90.02) a sorti l'écriture d'index de la transaction (`DB::afterCommit()`). Re-mesuré
après lui : l'achat est validé, mais l'exception du rappel d'après commit remonte au contrôleur,
et `POST /api/properties/{id}/boosts` répond 500 pour un achat fait.

## Décision du porteur

« validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V1 (classement du mesureur : le correctif décide si un débit de crédits est
écrit quand l'index échoue).

**Choix retenu** : la piste laisse deux voies pour ne pas laisser l'échec annuler l'achat,
`report()` ou une mise en file, sans en recommander une. La plus étroite est `report()` : aucun
job neuf. L'écriture d'index de `writeProperty()` passe par `rescue(…, report: true)`, dans le
rappel d'après commit.

## Objectif

Un moteur de recherche injoignable ne refuse ni n'annule l'achat d'un boost : le boost, le débit et
la mise en avant du bien sont écrits, l'appel répond 201, et l'échec d'index est rapporté.

## Delta à produire

- [x] `BoostLifecycle::writeProperty()` : `DB::afterCommit(fn () => rescue(fn () => $fresh->reindexer(), report: true))`.
- [x] Test `tests/Feature/Boost/BoostAchatMoteurInjoignableTest.php`.

## Critères d'acceptation

- [x] AC1 — Moteur sur un port fermé, `POST /api/properties/{id}/boosts` d'une Vedette 15 jours → 201, `balance` 65 ; un boost `active` en base, solde 65, bien `featured=true`, `CommunicationException` rapportée.

## Hors périmètre

- Rattraper le document périmé : il le reste jusqu'à la prochaine écriture du bien ou un réimport.
  Un job de réindexation relancé seul est la voie que le délégué recommande pour P90.03 et P89.01,
  au porteur.
- Les autres écritures d'index (`Property::reindexer()` des équipements, `GeoReindexation`) lèvent
  toujours : reste de P90.03, au porteur.

## Notes d'implémentation

- Le `rescue()` est dans le rappel d'après commit et non autour de `reindexer()` : hors de lui,
  il ne verrait rien, l'écriture ayant lieu plus tard.
- Tous les appelants de `writeProperty()` en profitent (offre, annulation, réconciliation) :
  l'écriture en base y est déjà validée quand l'index échoue.
- Avant correctif (après TCK-1452) : 500 au lieu de 201.
- Ablation : `BoostLifecycle.php` rendu à son état de TCK-1452 → le même 500 ; correctif remis → vert.
