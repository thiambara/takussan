---
id: TCK-2627
title: "Alertes et exports, côté API : la valeur actuelle, l'historique des déclenchements et qui est prévenu ; les derniers exports du compte"
status: todo
phase: P2
family: back
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2629]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#65-thresholdalert-"
    - "docs/models-spec.md#64-kpiconfig-"
tags: [back, reporting, alertes, exports, audit-ux, app]
---

## Objectif utilisateur

L'admin qui règle une alerte voit où en est la mesure aujourd'hui (« Taux d'impayés : 3,91 % · seuil 10 % »), quand l'alerte a sonné, et qui elle a prévenu. Celui qui exporte retrouve ses derniers exports et les relance en un geste.

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- **Alertes** :
  - `GET /api/threshold-alerts` (`ThresholdAlertController::index`) rend la configuration, plus `last_value` et `last_triggered_at`. `last_value` n'est écrite **qu'au déclenchement** (`CheckThresholdAlertsCommand`, `:66-73`) : une alerte jamais déclenchée n'a pas de valeur, et sa valeur n'est jamais « actuelle ».
  - **Aucun historique** : chaque déclenchement écrase le précédent.
  - **Destinataires** : les admins d'agence actifs (`:61-63`). **Canaux** : ceux que chaque destinataire autorise pour `ThresholdAlertTriggered::EVENT_TYPE` (`via()`, in-app et e-mail). Rien de cela n'est rendu.
- **Exports** :
  - `GET /api/export/{entity}` (`ExportController::show`) produit le fichier **en flux**, sans rien stocker ;
  - il journalise `activity('export')->event('data_exported')`, avec `entity`, `filters` (`from`, `to`, `limit`), `row_count`, `agency_id` et `format` (`:85-95`) ;
  - **aucune route ne relit ce journal** pour l'utilisateur.

  (Les `ReportExport` asynchrones et leur purge à J+7 sont ceux de la console super-admin, TCK-1213. Ils ne servent pas `/app`.)
- **Indicateurs** : `kpi-configs` accepte déjà `sort_order` et `is_enabled` en écriture (`UpdateKpiConfigRequest:51`). Rien à ajouter pour « Personnaliser les chiffres ».

## Direction UX / Artistique

Sans objet (ticket API). Écrans servis : TCK-2629 (« Alertes », « Exports »).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md).
- **Valeur actuelle** : `current_value` se calcule à la lecture, par `KpiResolver::forAgency`, comme le passage horaire. `null` si la métrique n'a pas de dénominateur (TCK-1114). **Une seule résolution par requête**, quel que soit le nombre d'alertes.
- **Historique des déclenchements** :
  - une entrée du journal d'activité par déclenchement (`activity('threshold_alert')`, `event = triggered`, propriétés `value`, `threshold`, `operator`, `recipients_count`) ;
  - écrite **dans la même transaction** que `last_triggered_at`, avant l'envoi (règle TCK-1249 : un envoi qui échoue n'efface pas le déclenchement) ;
  - **aucun modèle neuf**.
- **Destinataires** : la même requête que le passage horaire, factorisée et non recopiée. Rendus en compte et en noms (`{id, name}`), visibles par qui lit l'alerte (l'admin de l'agence). Les canaux rendus sont ceux de l'événement (`in_app`, `email`), sans les préférences de chacun.
- **Derniers exports** :
  - `GET /api/me/exports` rend les entrées `data_exported` **de l'appelant seul**, dans l'agence active ;
  - 10 par défaut, au plus 50, de la plus récente à la plus ancienne ;
  - forme : `{at, entity, format, filters {from, to}, row_count}` ;
  - **rien n'est retéléchargé** : « Refaire » rejoue `export/{entity}` avec les mêmes paramètres, sous les **capacités d'aujourd'hui** (un export devenu interdit rend 403 au rejeu, jamais un fichier en cache).
- **Données personnelles** : le journal ne porte que des filtres de période et des comptes, rien de neuf pour la portabilité.

## Delta à produire

- [ ] `ThresholdAlertController::index` et `show` :
  - `current_value` ;
  - `recipients {count, users [{id, name}]}` ;
  - `channels` (`in_app`, `email`) ;
  - `include=triggers` → `triggers [{at, value}]`, les 10 derniers.
- [ ] `CheckThresholdAlertsCommand` : entrée du journal au déclenchement ; la requête des destinataires extraite (`ThresholdAlertRecipients`).
- [ ] `GET /api/me/exports` → `MeExportsController::index`, sur le journal d'activité.
- [ ] Tests :
  - `ThresholdAlertCurrentValueTest` : valeur actuelle sans déclenchement, `null` sans dénominateur, une seule résolution pour 5 alertes ;
  - `ThresholdAlertTriggersHistoryTest` : deux déclenchements rendent deux entrées, et un envoi qui lève garde l'entrée ;
  - `MeExportsTest` : seulement les exports de l'appelant, ceux de l'agence active, plafond 50.

## Critères d'acceptation

- [ ] AC1 — Alerte « Taux d'impayés > 10 % », jamais déclenchée, sur une agence à 3,91 % : `GET /api/threshold-alerts` rend `current_value = 3.91`, `last_triggered_at = null` et `recipients.count` égal au nombre d'admins actifs de l'agence.
- [ ] AC2 — Après deux passages qui déclenchent (cooldown écoulé entre eux), `include=triggers` rend deux entrées datées, la plus récente d'abord. Si l'envoi de la notification lève, l'entrée existe quand même.
- [ ] AC3 — L'admin A exporte les paiements d'octobre en Excel, puis l'agent B de la même agence exporte les biens : `GET /api/me/exports` rend pour A une seule ligne `{entity: payments, format: xlsx, filters: {from: 2026-10-01, to: 2026-10-31}}` et rien de B.
- [ ] AC4 — Ablation : retirer l'écriture du journal au déclenchement fait rougir AC2.

## Hors périmètre

- L'envoi programmé d'un export (le 1er du mois) et l'export comptable SYSCOHADA : ambitions de l'audit, non retenues.
- Les écrans (TCK-2629).
- Le choix des destinataires d'une alerte par l'admin : ce sont les admins de l'agence, comme aujourd'hui.

## Notes d'implémentation

**Re-mesure (2026-11-11, branche `feat/audit-ux-app-lot-1`)** : le Contrat de données est juste sur trois points (`last_value` écrite au seul déclenchement ; aucun historique ; journal `data_exported` jamais relu). Trois écarts :

1. **`show` n'existait pas** : `threshold-alerts` n'exposait que `index/store/update/destroy`. Ajouté, sous `AgencyIndicatorPolicy::view` (neuve), qui reprend la règle de la liste : le personnel de l'agence (`staffAgencyId`) ou le super-admin.
2. **Canaux** : le vocabulaire des canaux de notification sur le fil est `inapp` (`PreferenceResolver::CHANNEL_INAPP`, déjà lu par le front pour les recherches sauvegardées), pas `in_app`. Pour rester cohérent avec ce vocabulaire, `channels` rend `["inapp", "email"]` (`ThresholdAlertTriggered::CHANNELS`, qui reprend les deux constantes de `via()`).
3. **Instants** : `at` sort dans la forme du dépôt (`BaseResource::instantOnWire`, `…+00:00`).

**Ce qui est fait**

- `ThresholdAlertReading` (service) ajoute à chaque alerte `current_value`, `recipients {count, users [{id, name}]}` et `channels`, plus `triggers [{at, value}]` sur `include=triggers` (les 10 derniers, le plus récent d'abord). Le coût ne dépend pas du nombre d'alertes :
  - une résolution `KpiResolver::forAgency` et une requête de destinataires par agence de la page, donc une seule pour le personnel ;
  - une requête `ROW_NUMBER()` pour tous les déclenchements.

  `current_value` vaut `null` quand la métrique est `null`.
- `include=triggers` est déclaré à spatie par `AllowedInclude::custom('triggers', InclusionLueParLeControleur)` (`app/Support/Query/`), une inclusion sans relation que le contrôleur lit. Sans elle, spatie rendait 400.
- `ThresholdAlertRecipients::query()` : la requête des destinataires, extraite du passage horaire et relue par la lecture de l'alerte.
- `CheckThresholdAlertsCommand` écrit `activity('threshold_alert')`, `event=triggered`, sur le sujet (l'alerte, donc `agency_id` du journal résolu par `AuditAgencyResolver`). Propriétés : `value`, `threshold`, `operator`, `recipients_count`. L'écriture se fait dans le même `DB::transaction` que `last_triggered_at`, avant l'envoi.
- `GET /api/me/exports` (`MeExportsController`, `ListMeExportsRequest` avec `limit` 1..50, 10 par défaut, 422 au-delà) lit le journal `export`/`data_exported` de l'appelant (`causer`) dans son agence active. L'agence active se lit par la même expression que l'écrivain (`staffAgencyId() ?? agency_id`), comparée à la colonne `agency_id` du journal. Forme : `{at, entity, format, filters {from, to}, row_count}`.
- La route est dans un fichier neuf, `routes/api/me-exports.php`, car `me.php` porte des modifications en cours d'une autre voie (TCK-2649).
- `ValeursEnListeParcoursDesRoutesTest::HORS_PARCOURS` nomme la route neuve `threshold-alerts/{threshold_alert}`, que le parcours ne rapproche pas de `$thresholdAlert`. `ThresholdAlert` n'a pas de fabrique.

**Tests** :

- `ThresholdAlertCurrentValueTest` (5 : AC1 ; `null` sans dénominateur ; une seule résolution pour toutes les métriques ; requêtes constantes de 1 à 5 alertes ; `show` et refus inter-agence) ;
- `ThresholdAlertTriggersHistoryTest` (3 : deux passages donnent deux entrées et le cooldown respecté n'en écrit pas ; un envoi qui lève garde l'entrée ; plafond de 10 par alerte) ;
- `MeExportsTest` (4 : AC3 par deux vrais exports ; agence active et ordre ; 10/50/422 ; invité refusé).

AC3 : B est un second **admin** et non un agent. Le rôle système d'agent n'a pas `reports.export`, son export de biens rendrait 403 et n'écrirait rien.

Ablations D1 à D12, toutes rouges puis restaurées (md5). D1 est AC4.

Voisins : 131 tests verts (alertes, indicateurs, gouvernance, exports, notifications) ; gardes de parcours des routes et des includes vertes.
