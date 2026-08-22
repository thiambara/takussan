---
id: TCK-343
title: "Exploiter JSONB : index GIN et requêtes sur les colonnes de propriétés"
status: todo
phase: P3
family: technique
estimate: M
wave: 43
created: 2026-08-21
updated: 2026-08-21
depends_on: []
blocks: []
spec_refs:
  models:
    - docs/models-spec.md
tags: [back, postgresql, performance]
---

## Contexte

ADR-0020 a converti les **69 colonnes `json` en `jsonb`** pendant que les tables étaient vides —
la seule fenêtre où c'était un mot à changer plutôt qu'un `ALTER` sous `ACCESS EXCLUSIVE`.

**Ce ticket est la moitié qui n'a délibérément PAS été faite.** Le type est posé ; rien ne
l'exploite. Mesuré le 2026-08-21 : `whereJsonContains` = **0**, `whereJsonLength` = **0**,
`where('col->chemin')` = **0** dans tout `app/`. Le JSON est lu en bloc et casté en PHP.

*Une conversion de type sans requête qui l'emploie ne rapporte rien aujourd'hui — c'est ce qui
la rendait sûre à embarquer, et c'est ce qui rend ce ticket non urgent.*

## Ce qu'il y a à faire

1. **Trouver les lectures qui filtrent en PHP** ce qu'un index GIN filtrerait en base. Ne pas
   commencer par les index : commencer par les requêtes qui en auraient besoin.
2. **Mesurer avant d'indexer.** Un index GIN coûte à l'écriture ; 69 colonnes indexées « au cas
   où » seraient une régression. `EXPLAIN (ANALYZE, BUFFERS)` sur les requêtes chaudes.
3. Trois colonnes ont été signalées comme discutables par la reconnaissance — `bank_statement_lines.raw_payload`,
   `integration_webhook_logs.payload`, `app_notifications.delivery_attempts` : des charges brutes
   archivées, que `jsonb` réordonne et normalise. Elles ont été converties parce qu'aucune n'est
   comparée octet à octet (`raw_payload` est casté `array`). **Si un besoin de fidélité à l'octet
   apparaît (preuve, rejeu, signature), c'est ici qu'il se traite**, en revenant à `json` pour
   celles-là seulement, et en l'écrivant.

## Ce que ce ticket ne fait pas

Il ne touche pas à `pg_trgm` ni à la recherche plein-texte (TCK-345), ni à pgvector (TCK-344).

## Références

- [ADR-0020](../../adr/0020-postgresql-sur-tous-les-environnements.md) §4 — la décision
- [`docs/plans/2026-08-21-recon-postgres.md`](../../plans/2026-08-21-recon-postgres.md) §F1 — l'inventaire mesuré
