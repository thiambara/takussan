---
id: TCK-220
title: "Super-admin — Alertes sur actions sensibles"
status: todo
phase: P3
family: applicatif
estimate: S
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#30-setting
tags: [back, front, super_admin, security, p3]
---

## Contexte

`features.md` §2.6 P3 prévoit les "Alertes sur actions sensibles". TCK-145 livre un audit cross-tenant consultable, mais sans push : un super-admin ne sait pas en temps réel qu'une impersonation vient de démarrer, qu'une agence a été suspendue, ou qu'un tag plateforme vient d'être supprimé. La détection passe par l'inspection manuelle de l'audit — délai inacceptable pour des opérations sensibles.

## Objectif utilisateur

Un super-admin configure depuis `/super-admin/alerts` la liste des événements sensibles à surveiller et leurs canaux de diffusion (email, webhook Slack/Discord) — chaque déclenchement envoie une alerte immédiate vers les canaux configurés, en plus de l'audit existant.

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/alert-rules` — règles configurées (event, channels, recipients, is_active)
- `POST /api/admin/alert-rules` — créer `{ event, channels: [...], recipients, is_active }`
- `PATCH /api/admin/alert-rules/{id}`
- `DELETE /api/admin/alert-rules/{id}`
- `POST /api/admin/alert-rules/{id}/test` — déclenche une alerte synthétique sur tous les canaux configurés

Catalogue d'événements déclaratif côté backend : `super_admin_impersonation_started`, `super_admin_agency_suspended`, `super_admin_setting_updated`, `super_admin_feature_flag_updated`, `super_admin_password_reset_forced`, etc.

## Direction UX / Artistique

Page liste des règles + bouton "Nouvelle règle". Modale de configuration : sélecteur d'événement (multi-select dans le catalogue), canaux (email récipiendaires multiples / URL webhook Slack format Incoming Webhook / URL webhook Discord), bouton "Tester". Indicateur de dernière exécution par règle.

## Contraintes strictes (métier)

- Endpoints super-admin-only.
- L'envoi est **asynchrone** (queue job) — l'action sensible ne bloque pas sur le dispatch d'alerte.
- Échec d'envoi : retry exponentiel max 3 fois, puis log d'erreur visible côté `/super-admin/alerts` (compteur d'échecs récents).
- Le payload Slack / Discord ne contient **jamais** de PII détaillée (juste l'événement, l'acteur, le sujet, et un lien vers `/super-admin/audit?...`).
- Activity log : chaque mutation de règle est tracée.
- Un événement non listé dans le catalogue est rejeté 422 à la création.
- Le test synthétique inclut un préfixe `[TEST]` pour distinguer des vrais déclenchements.

## Delta à produire

- [ ] Migration : table `alert_rules` (`event`, `channels_json`, `recipients_json`, `is_active`, `last_triggered_at`, `failure_count`)
- [ ] Listener générique `App\Listeners\Admin\DispatchAlerts` abonné au système d'événements applicatifs
- [ ] Notifiers : `App\Notifications\Admin\{EmailAlert, SlackWebhookAlert, DiscordWebhookAlert}`
- [ ] Service `App\Services\Admin\AlertRuleService`
- [ ] Controller `Admin\AlertRuleController`
- [ ] Catalogue `App\Domain\Alerts\AlertableEvents` (whitelist)
- [ ] Routes `routes/api/admin.php`
- [ ] Frontend page `/super-admin/alerts`
- [ ] Composants : `AlertRuleTable`, `AlertRuleDialog`, `AlertTestButton`
- [ ] Tests backend : 403 hors super-admin, dispatch async, retry, payload sans PII détaillée, `[TEST]` préfixé
- [ ] Tests UI : création, édition, test

## Critères d'acceptation

- [ ] Une impersonation démarrée envoie une alerte sur tous les canaux configurés en < 30 secondes
- [ ] Le payload Slack ne contient pas l'email cible en clair (juste un id + lien vers l'audit)
- [ ] Une règle sur un événement hors catalogue est rejetée 422
- [ ] L'échec persistant d'un canal incrémente `failure_count` visible côté UI
- [ ] Un agency_admin reçoit 403
- [ ] Le test synthétique préfixe `[TEST]` dans le message envoyé
- [ ] Chaque mutation de règle produit une entrée d'audit

## Hors périmètre

- Alerting basé sur des seuils métier (pic de connexions, baisse de revenu) — out of scope, ce ticket couvre les actions discrètes
- Intégration PagerDuty / OpsGenie (out of scope, webhook générique suffisant)
- Réception d'acquittements depuis Slack — out of scope

## Notes d'implémentation

_(à remplir par implementing-specs)_
