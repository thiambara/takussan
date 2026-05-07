---
id: TCK-219
title: "Super-admin — Feature flags applicatifs"
status: review
phase: P3
family: applicatif
estimate: M
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#30-setting
tags: [back, front, super_admin, p3]
---

## Contexte

`features.md` §2.9 P3 prévoit les "Feature flags". TCK-144 mentionne explicitement un `Admin\FeatureFlagController` comme sous-ticket à filer. Sans flags, chaque rollout d'une nouveauté nécessite un déploiement et expose immédiatement tous les utilisateurs — sans canary ni cible par segment.

## Objectif utilisateur

Un super-admin ouvre `/super-admin/feature-flags`, voit la liste des flags applicatifs et leur état, peut activer / désactiver un flag globalement ou pour un segment (rôle, agence, % d'utilisateurs), et tester via un *override* sur sa propre session.

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/feature-flags` — liste (key, label, description, enabled, segments)
- `PATCH /api/admin/feature-flags/{key}` — `{ enabled, segments?: { roles?, agency_ids?, rollout_percentage? } }`
- `GET /api/feature-flags/me` — endpoint authentifié retournant le set de flags actifs pour l'utilisateur courant (cacheable 60s)
- `POST /api/admin/feature-flags/{key}/override` — override de session pour le super-admin (`{ enabled }`) — utile pour tester avant rollout

Le store utilise une table dédiée `feature_flags` (`key`, `label`, `description`, `enabled`, `segments_json`, `updated_at`, `updated_by`).

## Direction UX / Artistique

Liste tabulaire avec toggle global et bouton "Configurer" par flag. Modale de configuration avec onglets : *Global*, *Par rôle*, *Par agence*, *Rollout %*. Indicateur clair de l'override de session du super-admin (badge "vous testez").

## Contraintes strictes (métier)

- Endpoints super-admin-only (sauf `GET /api/feature-flags/me`).
- Évaluation déterministe : pour un user donné, le flag est stable (hash bucketing sur `user_id` pour le rollout %).
- Catalogue déclaratif côté backend : un flag inconnu retourné par le code n'est jamais activé (fail-closed).
- Activity log sur chaque mutation (`super_admin_feature_flag_updated`).
- L'override de session est volatile (Sanctum token meta ou cache courte durée 1h max), n'affecte que le super-admin opérant.
- Aucun flag exposé côté `GET /api/feature-flags/me` ne doit fuiter d'information sensible (clés et descriptions internes restent cachées au front si non listées dans une whitelist `client_visible`).

## Delta à produire

- [x] Migration : table `feature_flags`
- [x] Catalogue déclaratif `App\Domain\Features\Flag` (énumération + métadonnées)
- [x] Service `App\Services\Features\FeatureFlagEvaluator` (évaluation déterministe + cache)
- [x] Helper / facade `Feature::for($user)->isEnabled('key')`
- [x] Controller `Admin\FeatureFlagController`
- [x] Endpoint authentifié `GET /api/feature-flags/me`
- [x] Hook frontend `useFeatureFlag('key')` + provider qui charge `/api/feature-flags/me` au boot
- [x] Activity log événement
- [x] Frontend page `/super-admin/feature-flags`
- [x] Composants : `FeatureFlagTable`, `FeatureFlagSegmentDialog`, `SessionOverrideToggle`
- [x] Tests backend : évaluation par segment, rollout % stable, fail-closed sur flag inconnu, 403 hors super-admin
- [x] Tests UI : édition, override session, lecture côté agent

## Critères d'acceptation

- [x] Un flag inconnu du catalogue retourne `false` partout (fail-closed)
- [x] Le rollout % bucket est stable : un user reçoit le même verdict à chaque évaluation
- [x] L'override de session n'affecte aucun autre utilisateur (test isolé)
- [x] `GET /api/feature-flags/me` n'expose que les flags marqués `client_visible`
- [x] Un agency_admin reçoit 403 sur `PATCH /api/admin/feature-flags/{key}`
- [x] Chaque mutation produit une entrée d'audit

## Hors périmètre

- Provider externe (LaunchDarkly, Unleash) — implémentation interne
- Ciblage géographique avancé — non couvert
- Auto-disable sur métriques d'erreur — out of scope

## Notes d'implémentation

- Catalogue initial limité à `property_compare`, `advanced_search`, `maintenance_banner`; tout autre flag reste fail-closed.
- Le rollout % utilise un bucket stable `hash(flag:user_id) % 100`.
- L'override session est stocké en cache par `user_id:key` pendant 1h et n'est jamais persisté dans `feature_flags`.
