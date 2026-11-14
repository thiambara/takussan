---
id: TCK-2763
title: "Historique d'un bail : l'API sert l'auteur de chaque événement (causer) sur /api/audit-log/{entity}/{id}, et la fiche le nomme"
status: todo
phase: P1
family: back
estimate: S
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2645]
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
tags: [back, front, leases, audit, audit-ux, app]
---

## Objectif utilisateur

Dans l'onglet « Historique » de la fiche d'un bail, on lit qui a fait chaque chose (« Loyer révisé · Awa Diop · 3 nov. »), pas seulement quoi et quand.

## Contrat de données

Ce ticket est le suivi de la question 6 de TCK-2645 (team-lead, 2026-11-12 : « (a), ticket API de suivi »).

Relevé du 2026-11-12, dans `app/Http/Controllers/Api/AuditLogController.php` :
- `indexByEntity` charge déjà `causer` (`with('causer')`), mais il ne rend que `causer_type` et `causer_id` ;
- `index` rend `causer: {id, name, email}`, avec le nom pris dans `full_name` (TCK-1261).

L'onglet de TCK-2645 (`OngletHistoriqueDuBail`) rend l'événement et la date, sans auteur.

## Delta à produire

- API : `indexByEntity` rend `causer: {id, name}` comme `index`, sans `email`, car l'onglet n'en a pas besoin. Un auteur supprimé ou un événement système donne `causer: null`. Aucune requête de plus : la relation est déjà chargée.
- Front : `OngletHistoriqueDuBail` affiche le nom après le libellé de l'événement. Sans auteur, il affiche « Automatique » (clé neuve, trois langues, `wo` = texte français).

## Critères d'acceptation

- [ ] AC1 — `GET /api/audit-log/lease/{id}` rend `causer.name` pour un événement d'utilisateur, et `causer: null` pour un événement système. Test Feature ; ablation : sans la clé, le test rougit.
- [ ] AC2 — L'onglet nomme l'auteur, ou dit « Automatique ». Test de composant ; ablation.
- [ ] AC3 — Le nombre de requêtes de l'endpoint ne change pas (relevé avant et après).
