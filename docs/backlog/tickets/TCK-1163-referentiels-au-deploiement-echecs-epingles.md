---
id: TCK-1163
title: "Référentiels au déploiement : échecs tolérés épinglés, fichier de région invalide sur un message"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-89--commandes-de-releasesh-et-seedsh--code-de-sortie-et-conclusion-du-script"
tags: [back, release, geo, pistes]
---

## Contexte

Réf : **P89.05** du fichier de pistes (🟢), `retenu · autonome` (A5 et A1 : `release.sh` écrit
déjà « un échec n'arrête pas le déploiement », et la commande rend un message d'une ligne et
`FAILURE` sur ses autres erreurs).

`scripts/test-release-reindex.sh` ne jouait l'échec ni de `geo:sync-referential` ni de
`tags:sync-catalog`. `GeoSyncReferential` n'attrapait que `RuntimeException` ; un JSON de région
invalide levait une `JsonException` (`JSON_THROW_ON_ERROR`), qui sortait sur une trace.

## Delta à produire

- [x] Harnais : un passage `ECHEC_SUR=geo:sync-referential` et un `ECHEC_SUR=tags:sync-catalog` ;
      `release.sh` sort en 0 et joue les étapes suivantes.
- [x] `GeoSyncReferential` attrape aussi `JsonException`.
- [x] Test `test_un_fichier_de_region_invalide_echoue_sur_un_message`
      (`tests/Feature/Geo/GeoReferentialSeederTest.php`).

## Critères d'acceptation

- [x] AC1 — `geo:sync-referential` en échec : `release.sh` sort en 0, `tags:sync-catalog` est joué.
- [x] AC2 — `tags:sync-catalog` en échec : `release.sh` sort en 0, l'importation a lieu.
- [x] AC3 — un fichier de région `{pas du json` : la commande affiche « Syntax error » et sort en
      échec, sans exception.

## Hors périmètre

- `Meilisearch\Exceptions\CommunicationException` sort encore de la commande sur une trace (le
  code de sortie reste 1) : la piste ne vise que `JsonException`.

## Notes d'implémentation

- Ablation harnais : `|| echo` des deux référentiels remplacés par `|| exit 1` dans `release.sh`
  → 4 rouges ; script remis → vert.
- Ablation commande : sans `JsonException` dans le `catch` → le test rougit sur
  `JsonException: Syntax error` ; remis → 11/11 dans la classe.
