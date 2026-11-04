---
id: TCK-018
title: Audit & traçabilité
status: done
phase: P0
family: applicatif
estimate: S
wave: 23
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-013, TCK-049]
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#13-activitylog--remplacé-par-spatielaravel-activitylog
    - docs/models-spec.md#spatielaravel-activitylog
tags: [back, audit, spatie, activitylog]
---

## Contexte

Le journal d'activité est transversal à toute la plateforme. Spatie/laravel-activitylog remplace le modèle custom `ActivityLog` existant. Ce ticket met en place le logging automatique sur toutes les entités critiques.

## Objectif

Configurer spatie/laravel-activitylog sur les modèles critiques et exposer les endpoints de consultation et filtrage du journal.

## Delta à produire

### P0 — MVP bloquant

- [x] Installation et configuration `spatie/laravel-activitylog` (`config/activitylog.php`) — **absorbé par TCK-049**.
- [x] Trait `LogsActivity` sur les modèles critiques : User (TCK-049), Property / Booking / Lease / Invoice / Payout (déjà en place), + **Customer, BookingPayment, LeasePayment** ajoutés ici avec `dontLogIfAttributesChangedOnly` sur PII / IDs de transaction.
- [x] Migration des données existantes : **sans objet** (aucune table `activity_log` custom préexistante).
- [x] Tests : `ActivityLogTraitTest` avec `@DataProvider` couvrant les 8 modèles adoptés (create / update / delete + exclusion PII).

### P1

- [x] Endpoint `GET /api/activity-log` — ajouté en **alias canonique** sur le contrôleur existant `/api/audit-log` (rétro-compat préservée). `GET /api/activity-log/{entity}/{id}` dispo aussi.
- [x] Filtrage par `causer_id`, dates (`filter[date_from]` / `filter[date_to]` via spatie callback), `event`, plus flat params legacy (`?causer_id=`, `?from=`, `?to=`, `?event=`) côte à côte.
- [ ] Page Next.js : journal d'activité dans le dashboard admin — **déferrée**, bloque sur TCK-054/055 (design system + layout).
- [x] Tests : `ActivityLogEndpointTest` (6 cas) couvrant forbid non-admin, parité payload legacy/canonical, filtres causer/date/event, et route by-entity.

### P2

- [ ] Export CSV/JSON de l'audit trail (`GET /api/activity-log/export`) — **hors périmètre** de ce ticket.

### P3

- [ ] Alertes sur actions sensibles (suppression, changement de rôle) — **hors périmètre**.

## Critères d'acceptation

- [x] Toute création, modification ou suppression d'une entité critique est journalisée automatiquement (vérifié par `ActivityLogTraitTest` sur 8 modèles).
- [x] Le journal affiche l'utilisateur responsable (`causer`), l'entité concernée, et les changements (`attribute_changes` en v5 — `old` / `attributes`).
- [x] Le filtrage par entité, utilisateur et date fonctionne correctement (`ActivityLogEndpointTest`).
- [x] Les propriétés sensibles (password, tokens, `id_number`, `transaction_id`) sont exclues du log.

## Hors périmètre

- Historique de prix (journalisé via `PropertyPriceHistory`, → TCK-036).
- Notes CRM horodatées (→ TCK-020).
- Page Next.js admin → attend TCK-054/055.
- Export CSV/JSON → pas dans ce ticket.

## Notes d'implémentation

- **Delta vs TCK-049** : TCK-049 a installé le package, wired `User`, et posé le pattern `LogsActivity + logOnly + dontLogIfAttributesChangedOnly + dontLogEmptyChanges`. Ce ticket ferme le gap sur les modèles métier.
- **Modèles touchés ici** : `Customer`, `BookingPayment`, `LeasePayment` — les 5 autres (`Property`, `Booking`, `Lease`, `Invoice`, `Payout`) avaient déjà le trait configuré quand ce ticket a démarré (reliquat TCK-034 et co.).
- **PII / secrets exclus** : `Customer.id_number` (pièce d'identité), `BookingPayment.transaction_id` et `LeasePayment.transaction_id` (référence fournisseur de paiement Wave). Une modification *seule* de ces champs ne crée pas de log (short-circuit via `dontLogIfAttributesChangedOnly`) ; mélangée à un champ whitelisted, seul le champ whitelisted apparaît dans `attribute_changes`.
- **Endpoint** : choix **alias** plutôt que rename. `/api/audit-log` reste en place (back-compat avec `AuditLogTest` existant et clients déjà déployés) ; `/api/activity-log` est ajouté comme chemin canonique pointant sur la même action. Le controller accepte en parallèle les flat params legacy (`?from=`, `?causer_id=`) et les spatie-style nested filters (`?filter[date_from]=`, `?filter[causer_id]=`). L'`indexByEntity` est aliasé à `/api/activity-log/{entity}/{id}`.
- **Payload** : la route canonical expose `causer` (objet eager-loaded `{id, name, email}`) en plus des champs legacy. `subject` est **volontairement non chargé** — morph hétérogène, risque N+1.
- **v5 subtilité** : les changements sont dans `attribute_changes` (collection cast), pas `properties`. `properties` reste exposé dans le payload (valeur brute) pour rétro-compat avec les clients qui lisaient déjà cette colonne.
- **Tests** : `ActivityLogTraitTest` utilise `@DataProvider` avec un seul test paramétré — ajouter un modèle = une ligne de config, pas une classe. Pour les modèles sans champ sensible listé, `sensitive: []` court-circuite la branche sensitive.
