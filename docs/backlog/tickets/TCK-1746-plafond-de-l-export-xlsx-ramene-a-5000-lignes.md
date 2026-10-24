---
id: TCK-1746
title: "Le plafond de l'export XLSX est ramené à 5 000 lignes, que tient l'entité la plus large"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1306, TCK-1418]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-112--exports-synchrones-de-exportcontroller-et-du-registre-des-demandes-de-droits"
tags: [api, export, xlsx, memoire, pistes]
---

## Contexte

Réf : **P112.02** du fichier de pistes, `validé`.

`ExportWriter::xlsx()` passe toutes les lignes à `Excel::download()` d'un `FromArray` : la feuille
entière se bâtit en mémoire pendant la requête, sous `memory_limit = 256M`. Au plafond de 10 000
lignes, les reversements (15 colonnes, l'entité la plus large) coûtaient 134 à 174 Mo de surcroît
et mouraient sous 256M dans `zipstream-php` (mesure de l'implémenteur, 2026-10-22).

## Décision du porteur

« validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket »

Critère accordé : V7 (abaisser le plafond, écrire par morceaux ou passer en file : deux voies
changent ce que reçoit l'utilisateur).

Recommandation du délégué, que la décision reprend : la garde de mémoire au plafond XLSX sur
`payouts`, puis le même remède que celui retenu pour P78.03. P78.03 est livré (TCK-1418) : **une
borne de lignes en XLSX, et ce qui la dépasse refusé en 422**.

**Choix** : `ExportDataService::MAX_ROWS_XLSX = 5 000`, par le mécanisme déjà en place pour le PDF
(`maxRows()`) : une `limit` au-delà est refusée en 422 par `ShowExportRequest` (règle `max`
existante, aucun texte neuf), et un export sans `limit` reste à 5 000 lignes comme aujourd'hui
(`DEFAULT_ROWS`). La valeur 5 000 est la plus haute qui ne change rien à ce que le formulaire
rend : il n'envoie jamais de `limit`, et le plafond qu'il affiche (`PLAFOND_LIGNES_EXPORT`, 5 000)
reste juste. Le CSV garde ses 10 000.

## Objectif

Un export XLSX tient, à son plafond, sous la borne de mémoire que la garde applique au PDF.

## Delta à produire

- [x] `MAX_ROWS_XLSX = 5_000`, rendu par `maxRows('xlsx'|'excel')`.
- [x] Garde : `ExportMemoireAuPlafondTest::test_le_xlsx_des_reversements_au_plafond_tient_sous_la_borne_de_memoire`
  (reversements à 15 colonnes remplies, au plafond XLSX, surcroît < 128 Mo).
- [x] `ExportColonnesEtPlafondTest` : `limit=5001` en `xlsx` et `excel` → 422 ; `5000` → 200 ; CSV
  `5001` → 200 ; sans `limit`, l'XLSX demande 5 001 lignes.

## Critères d'acceptation

- [x] AC1 — `format=xlsx&limit=5001` rend 422 sur `limit`.
- [x] AC2 — Le XLSX de 5 000 reversements coûte moins de 128 Mo de surcroît.
- [x] AC3 — Le CSV et l'export sans `limit` rendent ce qu'ils rendaient.

## Hors périmètre

- L'écriture de la feuille par morceaux, et l'export en file : les deux autres voies de la Piste.
- Le seuil sous un worker FrankenPHP, non mesuré.

## Notes d'implémentation

- Avant correctif : la garde rend 135,7 Mo pour 10 000 reversements (rouge sur la borne de
  128 Mo), et `limit=5001` en xlsx rend 200.
- Ablation : `maxRows()` rendu à `HEAD` → les deux tests neufs rouges ; remis → verts.
