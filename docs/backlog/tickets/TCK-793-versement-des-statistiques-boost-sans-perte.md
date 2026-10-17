---
id: TCK-793
title: "Un versement des statistiques Boost qui échoue ne perd pas les compteurs de l'heure"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-18--statistiques-boost-face-aux-robots-aux-rendus-serveur-et-aux-revalidations
tags: [back, boost, statistiques, pistes]
---

## Contexte

Réf : **P18.05** du fichier de pistes, `retenu · autonome` (A1 : l'en-tête de `BoostStatsRecorder` et
l'ADR-0061 § 10 écrivent que les compteurs sont versés dans `property_boost_daily_stats`).
`BoostStatsRecorder::flush()` retirait chaque compteur du cache (`Cache::pull`) avant d'écrire sa
ligne : si l'écriture levait, le curseur `LAST_FLUSHED_KEY` n'avançait pas, mais le tick suivant
relisait des clés vides. Les impressions et les clics de l'heure étaient perdus sans trace.

## Delta à produire

- [x] `flush()` lit les deux compteurs (`get`), écrit la ligne (`upsert`), puis les retire.
- [x] Test : une écriture qui lève laisse les compteurs en cache, et le tick suivant les verse une fois.

## Critères d'acceptation

- [x] AC1 — Deux impressions et un clic, puis un `flush()` dont l'écriture lève : les deux compteurs
      restent en cache.
- [x] AC2 — Les deux ticks suivants versent 2 impressions et 1 clic, une seule fois, et retirent les
      compteurs.
- [x] AC3 — Un curseur perdu ne reverse toujours rien (`BoostStatsTest`).

## Hors périmètre

- L'ordre des étapes de `boosts:tick` (un `flush()` sauté quand une étape antérieure lève) et le
  versement double par deux planificateurs simultanés : hors du classement A1 de la piste, et sans
  planificateur multiple aujourd'hui.

## Hypothèses (mode sans humain)

- Un échec entre l'écriture et le retrait (rare : deux commandes de cache) reverserait l'heure au tick
  suivant. Préférer un double compte improbable à une perte certaine suit la décision de la piste
  (« lire avec `get`, écrire, puis `forget` »).

## Notes d'implémentation

- Ablation : `pull` restauré → `BoostStatsFlushFailureTest` rouge (compteur à 0 après l'échec) ; le
  retrait après écriture supprimé → ce test et `test_un_curseur_perdu_ne_reverse_rien` rouges ;
  remis → 7 verts sur les trois classes du tick.
- Le docblock de `BoostStatsTest::test_un_curseur_perdu_ne_reverse_rien` nommait le `pull` : il nomme
  désormais le retrait.
