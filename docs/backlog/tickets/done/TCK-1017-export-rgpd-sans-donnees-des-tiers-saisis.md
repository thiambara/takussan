---
id: TCK-1017
title: "L'export RGPD d'un membre ne rend que l'acte des lignes du journal dont il n'est que le causeur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  models:
    - "docs/models-spec.md#13-activitylog--remplacé-par-spatielaravel-activitylog"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-56--lecteurs-dactivity_log-restés-sur-properties-depuis-activitylog-v5"
tags: [api, privacy, activity-log, pistes]
---

## Contexte

Réf : **P56.02** du fichier de pistes, `validé` (V3 accordé). `DataExportBuilder::payloads()` rend
dans `audit-log.json` toutes les lignes dont le titulaire est le causeur ou le sujet, par
`->toArray()` : `attribute_changes` entier. Un agent qui a saisi un client recevait donc l'e-mail
et le téléphone de ce client dans son propre export. Re-mesuré le 2026-10-20 sur `pre-dev`
35d861d57 par le test de garde ci-dessous : avant correctif, l'export contient
`client.temoin@example.test`.

## Décision du porteur

> pour une ligne dont l'utilisateur n'est que le causeur, ne rendre que l'acte (`event`, `subject_type`, `subject_id`, `created_at`, `description`) ; garder le diff, passé par `PropertyRedactor`, pour les lignes dont il est le sujet ; un test : l'export d'un agent qui a saisi un client ne contient ni l'e-mail ni le téléphone de ce client (porteur, 2026-10-19)

## Objectif

L'export d'accès d'un membre ne contient plus les données des tiers qu'il a créés ou modifiés.

## Delta à produire

- [x] `DataExportBuilder` : `audit-log.json` projette chaque ligne par `auditRow()` — l'acte seul
      (cinq clés) quand le titulaire n'est pas le sujet ; la ligne entière, `properties` et
      `attribute_changes` passés par `PropertyRedactor`, quand il l'est.
- [x] `DataExportTest::test_l_export_d_un_agent_ne_contient_ni_l_e_mail_ni_le_telephone_des_clients_qu_il_a_saisis`.

## Critères d'acceptation

- [x] AC1 — Un agent crée un client (e-mail et téléphone témoins) puis change son e-mail : son
      export ne contient ni l'un ni l'autre, ni le nouvel e-mail.
- [x] AC2 — Les lignes de ce client dans l'export portent exactement `event`, `subject_type`,
      `subject_id`, `created_at`, `description`.
- [x] AC3 — La ligne `updated` dont l'agent est le sujet garde son diff (`last_name` en clair) et
      l'e-mail y vaut `[REDACTED]`.

## Hypothèses (mode sans humain)

- Une ligne dont le titulaire est à la fois causeur et sujet (il modifie son propre profil) est
  traitée comme une ligne dont il est le sujet : diff gardé, expurgé.
- L'expurgation masque aussi, dans ces lignes, l'e-mail et le téléphone du titulaire lui-même :
  c'est ce que fait `PropertyRedactor`, et la décision le nomme. Ces valeurs restent dans
  `profile.json`.

## Hors périmètre

- Les autres domaines de l'export (`bookings.json`, `messages.json`…), qui ne sont pas le sujet de
  P56.02.

## Notes d'implémentation

- Avant correctif : rouge, `client.temoin@example.test` présent dans `audit-log.json`.
- Ablation 1 (projection de l'acte neutralisée, toutes les lignes rendues entières et expurgées)
  → rouge (clés de la ligne client ≠ les cinq de l'acte).
- Ablation 2 (expurgation d'`attribute_changes` retirée sur les lignes du sujet) → rouge (e-mail
  en clair au lieu de `[REDACTED]`). Correctif remis → `DataExportTest` 7 verts.
