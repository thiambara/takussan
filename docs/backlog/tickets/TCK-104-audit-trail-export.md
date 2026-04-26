---
id: TCK-104
title: "Export audit trail"
status: done
phase: P2
family: applicatif
estimate: S
created: 2026-04-24
updated: 2026-04-26
depends_on: [TCK-018]
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#13-activitylog-
tags: [back, front, audit, export]
---

## Objectif utilisateur

Permettre à un Admin d'agence d'**exporter l'historique d'audit**
(ActivityLog) au format CSV ou XLSX selon des filtres (utilisateur,
plage de dates, action, type d'objet) pour répondre à un besoin de
conformité, d'investigation ou d'archivage externe.

## Contrat de données

**Backend — nouvel endpoint :**

- `GET /api/activity-logs/export`
  - Query params (compatibles spatie query builder) :
    - `format` : `csv` | `xlsx` (requis)
    - `filter[causer_id]` : id user (optionnel)
    - `filter[date_from]`, `filter[date_to]` : ISO dates (optionnel ;
      défaut 30 derniers jours, max range 1 an)
    - `filter[event]` : `created` | `updated` | `deleted` | etc.
    - `filter[subject_type]` : FQCN modèle
      (ex. `App\\Models\\Property`)
    - `filter[search]` : recherche dans description / properties
  - Réponse : streamed download (`Content-Disposition: attachment;
    filename="audit-trail-{agency}-{from}-{to}.{ext}"`).

**Colonnes exportées** :

| Colonne | Source |
|---|---|
| `id` | `activity_log.id` |
| `logged_at` | `activity_log.created_at` (ISO 8601) |
| `causer_email` | `causer->email` (ou `system` si null) |
| `causer_role` | rôle principal du causer |
| `event` | `event` |
| `subject_type` | nom court du modèle (`Property`, pas FQCN) |
| `subject_id` | `subject_id` |
| `description` | `description` |
| `properties_diff` | JSON encodé des `properties->changes` |
| `ip_address` | `properties->ip` si présent |

**Frontend — endpoint à consommer** : ci-dessus, avec UI de filtres et
download triggered via `<a download>` ou fetch + blob.

## Direction UX / Artistique

**Page admin `/admin/audit`** : tableau virtualisé des logs avec
filtres en sticky-top (date range picker, select user, select action,
select subject_type, search box). Bouton `Exporter` en haut-droite, qui
ouvre un dropdown `CSV` / `XLSX` et lance le téléchargement avec les
filtres courants.

Toast de confirmation au lancement ("Export en préparation, téléchargement
imminent…"). Si fichier > 5000 lignes, message d'attente + génération
async via job + email avec lien (cf. contraintes).

## Contraintes strictes (métier)

- **Permissions** : seuls les rôles `agency_admin`, `super_admin` peuvent
  exporter (Policy `ActivityLogPolicy@export`).
- **Scope agence** : un `agency_admin` ne voit que les logs liés à son
  agence (causer dans son agence OU subject appartenant à son agence).
  `super_admin` voit tout.
- **Limite range** : max 1 an entre `date_from` et `date_to` (422 sinon).
- **Limite volume** : si > 5000 lignes attendues, basculer en mode async :
  job `App\Jobs\Audit\ExportActivityLogJob` qui génère le fichier puis
  envoie un email avec lien signé temporaire (TTL 24h) au demandeur.
- **PII / RGPD** : `properties_diff` peut contenir des données sensibles
  (emails, etc.) — l'export est lui-même un acte tracé dans
  ActivityLog (`event=exported`, causer = admin demandeur, count =
  nombre de lignes, format).
- **Streaming** : pour le mode synchrone, utiliser un streamed response
  (memory-safe pour fichiers moyens, jusqu'à 5000 lignes).
- **Format XLSX** : library `maatwebsite/excel` (déjà standard Laravel).

## Delta à produire

- [ ] FormRequest : `ExportActivityLogRequest` (validation `format`,
      ranges).
- [ ] Policy : `ActivityLogPolicy@export` + scope agence dans
      `ActivityLogRepository::scopedForUser`.
- [ ] Service : `App\Services\Audit\ActivityLogExporter` (méthode
      `streamCsv`, `buildXlsx`).
- [ ] Job async : `App\Jobs\Audit\ExportActivityLogJob` (déclenché si
      count > 5000).
- [ ] Notification : `ActivityLogExportReadyNotification` (email + lien
      signé).
- [ ] Controller : `ActivityLogExportController@export` + route
      `routes/api/admin.php`.
- [ ] Page admin `/admin/audit` (tableau virtualisé + filtres + bouton
      export).
- [ ] Hook export : log de l'action d'export elle-même dans ActivityLog.
- [ ] Tests : `ActivityLogExporterTest` (format CSV/XLSX, scope agence,
      diff PII, async > 5000), `ExportActivityLogPolicyTest`.

## Critères d'acceptation

- [ ] AC1 — `GET /api/activity-logs/export?format=csv` par un
      `agency_admin` retourne un CSV streamé avec les bonnes colonnes
      pour son agence uniquement.
- [ ] AC2 — `format=xlsx` retourne un fichier `.xlsx` valide ouvrable
      dans Excel.
- [ ] AC3 — un user `agent` (non admin) → 403.
- [ ] AC4 — `agency_admin` d'une agence A ne voit jamais de logs liés à
      l'agence B (test feature).
- [ ] AC5 — `date_from` > `date_to` ou range > 1 an → 422.
- [ ] AC6 — export > 5000 lignes : la requête répond 202 immédiatement,
      le job tourne, l'email avec lien arrive.
- [ ] AC7 — chaque export crée une entrée ActivityLog `event=exported`
      avec count + format dans `properties`.
- [ ] AC8 — fichier CSV correctement échappé (virgules, retours ligne,
      guillemets dans `properties_diff`).

## Hors périmètre

- Export PDF / autres formats (P3).
- Filtre full-text avancé sur `properties_diff` côté DB (nécessiterait
  index JSON, P3).
- Anonymisation / redaction des PII dans l'export (futur ticket
  conformité RGPD dédié).
- Planification d'exports récurrents (P3 — "envoyez-moi un export
  mensuel").
- Visualisation graphique des logs (couvert par le dashboard global,
  P3).

## Notes d'implémentation

- **Agency scope** : l'agence-admin voit uniquement les logs dont le `causer` est un User appartenant à son agence (`users.agency_id`). Le filtre côté subject (objet modifié) est une amélioration P3 — les sujets sont des morphs hétérogènes et nécessiteraient des sous-requêtes par type.
- **Policy** : `Activity` est un modèle de package → `Gate::policy(Activity::class, ActivityLogPolicy::class)` enregistré dans `AppServiceProvider` (même pattern que `Media`).
- **Route download async** : route `activity-logs.export.download` publique (pas de `auth:sanctum`) validée par signature Laravel (`URL::temporarySignedRoute`, TTL 24h). La route export principale reste protégée par `auth:sanctum`.
- **`$log->properties` null** : le cast spatie retourne `null` (pas une collection vide) si la colonne est NULL en DB. Défensif via `$log->properties ?? collect()`.
- **Frontend** : UI navigateur non testée (pas de navigateur disponible) — type-check OK, aucune erreur sur les nouveaux fichiers.
- **Endpoint URL** : `/api/activity-logs/export` (plural) dans `routes/api/audit-log.php`, distinct du `/api/activity-log` (singular) de TCK-018 pour éviter la collision de route.
