---
id: TCK-225
title: "Super-admin — Export RGPD des données utilisateur (portabilité)"
status: todo
phase: P2
family: applicatif
estimate: M
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-210]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#1-user
tags: [back, front, super_admin, rgpd, p2]
---

## Contexte

La spec étend §2.1 avec le droit à la portabilité RGPD (export des données personnelles), déclenchable par l'utilisateur ou par un super-admin pour un utilisateur tiers (support / réquisition). Aujourd'hui aucune surface ne permet de produire cet export — la plateforme est techniquement non conforme.

## Objectif utilisateur

Un utilisateur déclenche son propre export depuis `/app/account/privacy` ; un super-admin déclenche l'export d'un utilisateur depuis `/super-admin/users/[id]` (TCK-210). Le job génère une archive ZIP signée (téléchargeable ≤ 7 jours), notifiée par email à l'utilisateur, et journalisée.

## Contrat de données

Endpoints :

- `POST /api/me/data-exports` — l'utilisateur déclenche son propre export. Throttle : 1 demande / 24h
- `POST /api/admin/users/{id}/data-exports` — super-admin déclenche pour un utilisateur tiers, body `{ reason }` (motif obligatoire, journalisé)
- `GET /api/me/data-exports` — liste des exports demandés par l'utilisateur (super-admin voit aussi ceux qu'il a demandés)
- `GET /api/data-exports/{id}/download` — URL signée temporaire (≤ 7j), 404 si l'export expiré ou destiné à un autre utilisateur

L'archive ZIP contient (1 dossier par domaine) :
- `profile.json` (User + profils OwnerProfile/AgentProfile/BrokerProfile/ServiceProviderProfile)
- `bookings.json`, `leases.json`, `payments.json`, `messages.json`, `reviews.json`, `notifications.json`, `documents.json`
- `media/` (copies des médias possédés par l'utilisateur)
- `audit-log.json` (entrées du journal d'activité où l'utilisateur est causer ou subject)

## Direction UX / Artistique

Page `/app/account/privacy` : section "Mes données" avec bouton "Demander mon export" + liste des exports passés (statut, lien). Côté super-admin : action "Demander un export" sur la fiche utilisateur (TCK-210), modale avec champ raison obligatoire. Email transactionnel "Votre export est prêt" avec lien signé.

## Contraintes strictes (métier)

- Le job d'export tourne en background queue (non bloquant). Statut `queued → processing → ready → expired/failed`.
- L'archive est stockée chiffrée au repos (cast `encrypted` sur le path / signed URL).
- Lien de téléchargement signé valide ≤ 7 jours, accessible **uniquement** à l'utilisateur cible (et au super-admin demandeur si déclenché en mode admin).
- L'utilisateur peut produire au plus **1 export par 24h** (throttle).
- Le super-admin doit fournir une `reason` non vide (catalogue de motifs proposé : `support`, `legal_request`, `user_inquiry`, `other`). La raison est journalisée.
- Activity log obligatoire (`user_data_export_requested`, `super_admin_data_export_requested`, `data_export_downloaded`).
- L'export contient **uniquement** les données dont l'utilisateur est propriétaire ou sujet — pas les données d'autres utilisateurs (test d'isolation).
- Au-delà de 7j, le job de purge supprime l'archive et marque l'export `expired`.

## Delta à produire

- [ ] Migration : table `data_exports` (`user_id`, `requested_by`, `reason`, `status`, `archive_path`, `size_bytes`, `requested_at`, `ready_at`, `expires_at`, `last_downloaded_at`)
- [ ] Modèle `DataExport` (LogsActivity)
- [ ] Service `App\Services\Privacy\DataExportBuilder` (parcours déterministe des domaines + zip + chiffrement + signature)
- [ ] Job `App\Jobs\Privacy\ProcessDataExport`
- [ ] Job purge `App\Jobs\Privacy\PurgeExpiredDataExports` (daily)
- [ ] Notification `DataExportReadyNotification` (email avec lien signé)
- [ ] Throttle middleware sur `POST /api/me/data-exports` (1 / 24h)
- [ ] Controllers `Api\Me\DataExportController`, `Admin\DataExportController`
- [ ] FormRequests (raison obligatoire admin)
- [ ] Activity log événements
- [ ] Frontend page `/app/account/privacy`
- [ ] Frontend action sur la fiche super-admin (TCK-210) avec modale raison
- [ ] Tests backend : isolation (export d'A ne contient pas de données B), throttle 1/24h, expiration 7j, lien signé inaccessible aux tiers, raison admin obligatoire, purge daily
- [ ] Tests UI : déclenchement, statut, téléchargement

## Critères d'acceptation

- [ ] L'archive d'A ne contient strictement aucune donnée d'un user B (test feature exhaustif)
- [ ] Une 2e demande dans les 24h retourne 429
- [ ] Un super-admin sans raison retourne 422
- [ ] Un lien signé > 7j retourne 410 Gone
- [ ] Le téléchargement par un tiers (token) retourne 403
- [ ] L'export couvre tous les domaines listés dans le contrat de données (assert sur le contenu du zip en test)
- [ ] Chaque demande / téléchargement produit une entrée d'audit
- [ ] Le job de purge supprime les fichiers expirés

## Hors périmètre

- Droit à l'oubli (suppression / anonymisation) — couvert par la P2 existante "Suppression de compte avec anonymisation" (ticket dédié si nécessaire)
- Export consolidé d'un foyer / multi-comptes liés — out of scope
- Export programmé récurrent — out of scope
- Support de formats alternatifs (CSV unique, XML) — JSON + medias suffit pour la portabilité

## Notes d'implémentation

_(à remplir par implementing-specs)_
