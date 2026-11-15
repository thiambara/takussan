---
id: TCK-2866
title: "Rapports, côté API : la balance âgée en PDF et le tri par montant dû, qui une alerte prévient et par quel canal, les exports conservés (« Retélécharger ») et le nombre de lignes avant export"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2868]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#65-thresholdalert-"
tags: [back, rapports, impayes, alertes, exports, audit-ux, app]
---

## Objectif utilisateur

L'admin envoie à son bailleur la balance âgée en PDF, voit d'abord les plus gros impayés, choisit qui est prévenu d'une alerte et comment, et retrouve un export déjà fait sans le refaire.

## Contrat de données

Relevé le 2026-11-15 (`dev` 8c60f4c58) :

- Impayés : la page de Rapports rend le composant d'« Argent » (décision 14 a de TCK-2629), liste triée par retard ; **aucun PDF** de balance âgée (recherche vide de `pdf` dans `components/admin/finances/impayes/`) ; tri par montant dû à vérifier sur la lecture des impayés — à ajouter s'il n'est pas servi.
- Alertes (`ThresholdAlert`, `ThresholdAlertRecipients`, TCK-2627) : **les destinataires sont fixés** (admins actifs ; `reports.view_agency` pour un chiffre consolidé), **le canal aussi** (cloche + courriel) ; le formulaire n'a ni « Qui est prévenu » ni « Canal » (TCK-2629 « hors périmètre », sans ticket).
- Exports : `GET /api/export/{entity}` produit le fichier à la volée ; `GET /api/me/exports` liste les exports passés **sans fichier conservé** (« Refaire » au lieu de « Retélécharger », TCK-2629) ; **aucun compte de lignes** avant export.

## Contraintes strictes (métier)

- **Balance âgée PDF** : `GET /api/agencies/{agency}/reports/aged-balance.pdf` (nom au choix, documenté) sous la même capacité que la lecture des impayés ; mêmes tranches et mêmes montants que l'écran (une seule source de calcul) ; filtre bailleur respecté.
- **Tri** : `sort=-remaining_amount` (montant dû) sur la lecture des impayés, dans `$requestSortable`.
- **Destinataires** : `ThresholdAlert` gagne `recipient_ids` (sous-ensemble **obligatoire** de `ThresholdAlertRecipients::for($metric)` — jamais quelqu'un qui ne pourrait pas lire la valeur ; vide = tous, comme aujourd'hui) et `channel ∈ {email, whatsapp, both}` (la cloche part toujours). WhatsApp passe par le canal sortant existant (spec § 2.3) et ses gardes de consentement.
- **Exports conservés** — **écrire l'ADR d'abord** : TCK-2629 a décidé « aucun fichier n'est conservé ni promis » ; garder un fichier d'export (données personnelles des clients et locataires) est une décision de rétention, qui doit nommer sa durée et sa purge et s'accorder avec la politique de confidentialité. Proposition : le fichier d'un export est gardé N jours (configuration, défaut 7) dans le stockage privé (ADR-0029), lié à son auteur ; `GET /api/me/exports/{id}/download` (URL signée), 410 après expiration ; purge planifiée.
- **Nombre de lignes** : `GET /api/export/{entity}/count` (mêmes filtres et même cloisonnement que l'export) rend `{count, limit}` (5 000 ; 200 en PDF).
- Migrations avec `down()` ; codes d'erreur neufs dans les langues de l'API.

## Delta à produire

- [ ] PDF de balance âgée.
- [ ] Tri par montant dû.
- [ ] `recipient_ids`, `channel` sur les alertes (migration, FormRequest, envoi).
- [ ] ADR (numéro suivant libre) : la conservation des fichiers d'export ; puis conservation, téléchargement et purge.
- [ ] Compte de lignes.
- [ ] Tests `AgedBalancePdfTest` (montants égaux à la lecture JSON), `OverdueSortByAmountTest`, `ThresholdAlertRecipientsChoiceTest` (destinataire hors de l'ensemble → 422 ; WhatsApp seul → pas de courriel), `ExportRetentionTest` (téléchargement d'un export d'un autre → 403 ; expiré → 410), `ExportCountTest`.

## Critères d'acceptation

- [ ] AC1 — Le PDF de balance âgée d'une agence à trois tranches porte les mêmes totaux par tranche que `BalanceAgee` lit en JSON.
- [ ] AC2 — `sort=-remaining_amount` rend le plus gros impayé en premier.
- [ ] AC3 — Alerte créée avec `recipient_ids = [Awa]` et `channel = whatsapp` : au déclenchement, seule Awa est prévenue, par la cloche et WhatsApp, sans courriel ; un `recipient_id` d'un agent sans `reports.view_agency` sur un chiffre consolidé → 422.
- [ ] AC4 — Un export fait il y a 2 jours se retélécharge (200, même contenu) ; à 8 jours → 410.
- [ ] AC5 — `export/leases/count?filter[…]` rend le même nombre que les lignes du fichier produit avec les mêmes filtres.

## Hors périmètre

- Les écrans : TCK-2868.

## Notes d'implémentation

2026-11-15 — implémenté (worktree `feat/audit-manques-2026-11-15`, base 073679378).

**ADR-0115** écrit d'abord : le fichier d'un export se garde `exports.retention_days` jours (7), à son seul auteur,
re-jugé sous ses capacités d'aujourd'hui ; révise « aucun fichier n'est conservé » (TCK-2629). Politique de
confidentialité § 6 complétée (fr, en).

Ce qui est livré (contrats pour TCK-2868) :

- **Balance âgée PDF** : `GET /api/agencies/{agency}/finance/aging.pdf` (garde `viewReports`, comme le JSON), même
  lecture `AgingBalanceService::forAgency()` ; `filter[landlord_id]` (ou `landlord_id`) vaut pour le JSON ET le PDF
  (422 `reporting.invalid_landlord` si ce n'est pas un entier) ; `group_by` aussi. Le JSON gagne `landlord_id`.
- **Tri par montant dû** : déjà servi (`PaymentHistory::sortKey`, `sort=-remaining_amount`) — seul le test manquait.
- **Alertes** : colonnes `recipient_ids` (jsonb, `null` = tous) et `channel` (`email` | `whatsapp` | `both`, défaut
  `email`). Choix hors de `forMetric()` → 422 `threshold_alert.recipient_not_allowed` (création ; mise à jour
  re-jugée sur la mesure NOUVELLE même sans renvoyer le choix). Au déclenchement, choix re-jugé ; un choix devenu
  vide ne revient PAS à « tous ». Lecture : `channel`, `channels` (cloche + canaux de l'alerte), `recipients` = choix
  effectif, `recipient_ids` et `recipient_candidates [{id,name}]` au seul lecteur qui peut modifier (sinon `null`/`[]`) ;
  `triggers[]` gagne `channel` et `recipients_count`. Neuf : `GET /api/threshold-alerts/recipient-candidates?metric=…`
  (garde de la création). WhatsApp : préférence du destinataire (`threshold_alert`/`whatsapp`, **désactivée par
  défaut** : chacun doit la cocher), numéro vérifié, et **hors fenêtre de service un gabarit Meta approuvé pour
  l'événement `threshold_alert` est exigé** (registre `notification_templates`, aucun n'existe aujourd'hui) ; pas de
  repli SMS (`smsFallbackAllowed() = false`).
- **Exports conservés** : table `export_files`, disque `media-library.disk_name` ; `GET /api/me/exports` rend par ligne
  `id` et `file {available, expires_at}` ; `GET /api/me/exports/{id}/download` : 403 autre auteur (super-admin
  compris), 410 `export.file_expired` à l'échéance (avant et après purge), 403 `export.forbidden` si l'auteur ne
  pourrait plus le refaire (`ShowExportRequest::judge()`, extrait d'`authorize()`), 404 sinon ; journal
  `data_export_redownloaded` (libellé front posé). Purge horaire `exports:purge-files`. Clé `EXPORT_RETENTION_DAYS`
  (.env.example, .env.docker commentées ; gabarit de production à 7).
- **Compte** : `GET /api/export/{entity}/count` → `{data: {count, limit}}`, même requête que le fichier
  (`ExportDataService::query()`, extraite des constructeurs) ; `payment_history` par `PaymentHistory::select()` qui rend
  désormais `count` ; `deposits` par baux.

Écarts à la prémisse : le tri existait ; AC5 parle de `filter[…]` sur les baux, mais l'export des baux ne filtre que
par `from`/`to` (seul `payment_history` lit `filter[…]`) — testé ainsi. TOC de `models-spec.md` : 126 et 127 y
manquaient, ajoutés avec 128 (ExportFile).

Tests : `OverdueSortByAmountTest`, `ExportCountTest`, `AgedBalancePdfTest`, `ThresholdAlertRecipientsChoiceTest`,
`ExportRetentionTest` (37 verts avec `MeExportsTest` mis à jour) ; ablations rouges une à une ; voisins verts
(exports, alertes, balayages, gardes d'architecture, gardes racine).
