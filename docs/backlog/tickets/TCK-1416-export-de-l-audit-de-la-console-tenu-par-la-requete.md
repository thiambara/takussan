---
id: TCK-1416
title: "L'export de l'audit de la console précharge le rôle de l'auteur, et son plafond suit ce que la requête tient"
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

Réf : **P78.02** du fichier de pistes, `validé`. Même angle que P78.01 (TCK-1414), dans le même
lot.

`GET /api/admin/audit/export` bâtit le CSV dans la requête, jusqu'à 50 000 lignes
(`CrossTenantAuditController::EXPORT_MAX_ROWS`, TCK-601), et `payloadForQuery()` ne préchargeait
que `causer` : six requêtes par ligne.

## Décision du porteur

« validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V7 (classement du mesureur : plafond abaissé ou export asynchrone, deux
comportements visibles).

**Choix** : la Piste ne recommande aucune des deux voies ; la plus étroite est le plafond abaissé.
Il rend le 422 `activity_log.export_too_large` que la console connaît déjà, sans réponse ni
courriel neufs. Le délégué l'avait aussi préféré. La valeur est mesurée après le préchargement :
**25 000 lignes**.

## Objectif

L'export de la console tient dans la requête, jusqu'à son plafond.

## Delta à produire

- [x] `ActivityLogExporter::payloadForQuery()` précharge ce que lit `profileTypes()`, par la même
  méthode que `buildPayload()` (`auteurEtSonRole()`, `morphWith` sur `User`).
- [x] `CrossTenantAuditController::EXPORT_MAX_ROWS` : 50 000 → 25 000.
- [x] Tests : requêtes constantes de `payloadForQuery()` (`ExportAuditRequetesParLigneTest`),
  422 à 25 001 lignes (`CrossTenantAuditExportTest`).

## Critères d'acceptation

- [x] AC1 — 10 et 100 lignes d'un même auteur font le même nombre de requêtes à l'export de la
  console.
- [x] AC2 — Au-delà de 25 000 lignes, l'export rend 422 `activity_log.export_too_large`.

## Hors périmètre

- Passer cet export par un job : c'est l'autre voie de la Piste, non retenue.
- Le `max_execution_time` sous FrankenPHP (temps CPU ou écoulé), et ce que coupent Traefik et le
  relais BFF : non mesurés, comme le notait la Piste.

## Notes d'implémentation

- Mesuré par un test temporaire (retiré), `payloadForQuery()` puis `csvContent()`, un même auteur,
  `properties` d'environ 250 octets, `memory_limit=-1` : 50 000 lignes → 46,6 s, 217 Mo de
  surcroît (charge `{ 2.90 4.06 4.15 }`) ; 25 000 → 22,5 s, 105 Mo (charge `{ 3.13 3.85 4.06 }`),
  sur 8 cœurs.
- Ablation : `ActivityLogExporter.php` rendu à l'état de TCK-1414 → 62 requêtes pour 10 lignes,
  602 pour 100, rouge ; plafond rendu à 50 000 → 25 001 lignes acceptées (200), rouge. Remis → verts.
