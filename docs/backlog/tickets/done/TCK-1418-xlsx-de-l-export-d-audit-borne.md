---
id: TCK-1418
title: "Le XLSX de l'export d'audit d'agence est borné à 20 000 lignes mesurées"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1414]
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-78--pic-mémoire-et-durée-des-exports-accumulés-en-tableau"
tags: [api, audit, export, perf, pistes]
---

## Contexte

Réf : **P78.03** du fichier de pistes, `validé`. Même angle que P78.01 (TCK-1414) et P78.02
(TCK-1416), dans le même lot.

En `xlsx`, `ExportActivityLogJob` passe toutes les lignes à `Excel::raw()` d'un `FromArray` :
la feuille entière se bâtit en mémoire, et rien ne borne le nombre de lignes du chemin
asynchrone, sinon la plage d'un an.

## Décision du porteur

« validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V7 (classement du mesureur : refus ou repli en CSV, un choix de produit).

**Choix** : la Piste propose trois voies (refus en 422 au-delà d'une borne, repli en CSV, écriture
par morceaux) sans en recommander une. La plus étroite est le refus, et avec le code que l'export
connaît déjà, `activity_log.export_too_large` (« Trop de lignes pour un export : resserrez les
filtres. ») : aucun texte neuf, aucun format rendu autre que celui demandé. Le délégué avait
recommandé le même refus. Borne : **20 000 lignes**, mesurée.

## Objectif

Un export XLSX d'agence ne part en file que s'il tient dans le délai et la mémoire du job.

## Delta à produire

- [x] `ActivityLogExportController::XLSX_MAX_ROWS = 20_000`, jugée sur le `$count` déjà calculé,
  avant la journalisation et la mise en file.
- [x] Test : `ExportAuditXlsxBorneTest` (20 001 lignes en `xlsx` → 422 et aucun job ; en `csv` →
  202 ; à la borne → 202).

## Critères d'acceptation

- [x] AC1 — Au-delà de 20 000 lignes, `format=xlsx` rend 422 `activity_log.export_too_large`, et
  aucun job ne part.
- [x] AC2 — Le CSV de la même plage part en file comme avant.

## Hors périmètre

- L'écriture de la feuille par morceaux, et le repli en CSV : les deux autres voies de la Piste.
- L'écran (`AuditTrail.tsx`) montre son toast d'erreur générique sur tout statut non-OK, 422
  compris ; il ne dit pas que le CSV passerait.

## Notes d'implémentation

- Mesure de la borne (test temporaire de TCK-1414, retiré) : job XLSX sur 20 000 lignes, 64,1 s
  après préchargement, charge `{ 2.75 2.67 3.04 }` sur 8 cœurs ; mémoire : 117,7 Mo de surcroît
  pour 20 000 lignes, mesurés par le mesureur (P78.03).
- Ablation : contrôleur rendu à `HEAD` → 20 001 lignes en `xlsx` rendent 202, rouge ; remis → vert.
