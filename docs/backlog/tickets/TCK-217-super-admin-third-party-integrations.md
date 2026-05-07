---
id: TCK-217
title: "Super-admin — Intégrations tierces (API keys, webhooks)"
status: review
phase: P2
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
    - docs/models-spec.md#31-integration
tags: [back, front, super_admin, integrations, p2]
---

## Contexte

`features.md` §2.9 P2 prévoit la "Gestion des intégrations tierces (API keys)". Le modèle `Integration` (cf. `models-spec.md#31-integration`) existe pour porter les credentials des fournisseurs (Wave, Orange Money, Stripe, SMS, mail provider). Aucune surface dans la console super-admin pour configurer ces credentials, surveiller leur santé, ni gérer les webhooks entrants.

## Objectif utilisateur

Un super-admin ouvre `/super-admin/integrations` et voit la liste des fournisseurs configurés, leur statut (actif / en panne / désactivé), peut éditer leurs API keys (chiffrées au repos), tester la connexion, et voir les webhooks récents reçus / émis.

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/integrations` — liste (provider, label, status, last_health_check_at)
- `GET /api/admin/integrations/{id}` — détail (jamais retourner la clé en clair — uniquement les 4 derniers caractères masqués)
- `PATCH /api/admin/integrations/{id}` — éditer (config JSON chiffré, is_active)
- `POST /api/admin/integrations/{id}/test` — déclenche un appel synthétique vers le provider et renvoie `{success, latency_ms, error?}`
- `GET /api/admin/integrations/{id}/webhooks` — liste paginée des webhooks récents (status, payload tronqué, processed_at)

## Direction UX / Artistique

Liste par catégorie (Paiements, Messagerie, Email, Stockage). Chaque carte expose le provider, le statut (badge coloré), un bouton "Tester" et un menu d'édition. Modale d'édition avec champs typés selon le provider (le schéma de config est déclaré côté backend et exposé pour rendu dynamique). Vue webhooks : tableau avec lien vers le payload complet (modale). Bandeau rouge persistant si une intégration critique est en panne (paiement notamment).

## Contraintes strictes (métier)

- Endpoints super-admin-only.
- Les API keys sont **chiffrées au repos** (cast `encrypted` Laravel) — aucun endpoint ne renvoie la clé en clair, même au super-admin (UI affiche `••••XXXX`).
- Schéma de config **déclaratif** par provider (`App\Domain\Integrations\Providers\*`) — l'UI rend les champs dynamiquement à partir du schéma exposé par l'endpoint `GET /api/admin/integrations/{id}/schema`.
- Activity log sur chaque édition — sans le contenu des clés (juste le diff structurel : "champ `api_key` modifié").
- Le test de connexion ne loggue pas la réponse complète du provider (risque de fuite de données sensibles) — seulement statut + latence.
- L'édition d'une intégration de paiement déclenche un événement applicatif `IntegrationConfigChanged` consommable par les services de réconciliation.

## Delta à produire

- [x] Migration / ajustement de la table `integrations` (cf. modèle) : ajouter `last_health_check_at`, `health_status`
- [x] Service `App\Services\Admin\IntegrationService` + connecteurs `App\Domain\Integrations\Providers\{Wave, OrangeMoney, Stripe, Sms, Mail}` (avec interface `IntegrationProvider` exposant `schema()`, `test()`, `validate()`)
- [x] Controller `Admin\IntegrationController` (`index`, `show`, `update`, `test`, `webhooks`, `schema`)
- [x] Routes `routes/api/admin.php`
- [x] Webhook ingest existant : ajouter persistance d'un trail (`integration_webhook_logs`) avec rétention 30j
- [x] Activity log `super_admin_integration_updated|tested`
- [x] Frontend page `/super-admin/integrations`
- [x] Composants : `IntegrationCard`, `IntegrationEditDialog` (rendu dynamique du schéma), `IntegrationTestButton`, `WebhookTrailTable`
- [x] Tests backend : 403 hors super-admin, clé jamais retournée en clair, schéma exposé, test renvoie statut + latence
- [x] Tests UI : édition, test connexion, vue webhooks

## Critères d'acceptation

- [x] Aucun endpoint ne renvoie une API key en clair (assert dans test)
- [x] L'UI affiche les keys masquées (`••••XXXX`)
- [x] `POST /test` renvoie un statut sans logger la réponse provider
- [x] L'édition d'une intégration paiement émet un événement applicatif vérifiable en test
- [x] Un agency_admin reçoit 403
- [x] Le trail webhook conserve 30 jours et purge au-delà
- [x] Chaque mutation produit une entrée d'audit (sans fuite des secrets)

## Hors périmètre

- Inscription publique d'un nouveau provider via la marketplace (out of scope)
- Rotation automatique des keys — non couvert
- Health checks proactifs / scheduling (un job cron pourra venir ultérieurement)

## Notes d'implémentation

- Les tests de connexion restent synthétiques : ils valident le schéma et l'état actif sans appeler les APIs providers, afin de ne pas risquer de fuite de réponse externe.
- Le trail webhook est branché sur l'ingest paiement existant ; les webhooks SMS entrants gardent leurs tables de livraison dédiées et ne sont pas dupliqués ici.
- Les endpoints admin exposent uniquement les credentials masqués (`••••XXXX`) ; l'édition ne renvoie jamais la valeur claire.
