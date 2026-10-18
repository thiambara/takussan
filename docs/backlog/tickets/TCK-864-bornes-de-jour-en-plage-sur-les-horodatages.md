---
id: TCK-864
title: "Bornes de jour sur un horodatage : une plage [début du jour, lendemain) au lieu de `whereDate()`"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes"
tags: [back, performance, requetes, pistes]
---

## Objectif utilisateur

Le calendrier, le tableau de bord de l'agent, la liste des biens, l'historique des paiements et
les exports filtrent un jour sur un horodatage d'une façon qu'un index peut servir, sans rien
changer aux lignes rendues.

## Contexte

Réf : **P02.06** du fichier de pistes, `retenu · autonome` (A2).

`whereDate()` compile en `"col"::date >= ?` sous PostgreSQL : le cast empêche l'usage d'un index
sur la colonne (mesuré par le mesureur sur `property_visits_scheduled_at_status_index`). Les
horodatages du dépôt sont tous des `timestamp without time zone` (aucun `timestampTz` dans les
migrations), écrits en UTC (`config/app.php`).

## Contrat de données

Aucun changement de schéma ni d'API.

## Contraintes strictes (métier)

- Aucun résultat ne change : `col::date >= J` ⇔ `col >= J 00:00`, `col::date <= J` ⇔
  `col < (J+1) 00:00`.
- Le jour se lit comme `whereDate()` le lisait : un `DateTimeInterface` par sa date `Y-m-d`, une
  chaîne par la date qu'elle écrit.

## Delta à produire

- [x] `App\Support\DayRange` : `start($jour)` (minuit, inclus), `after($jour)` (minuit du lendemain,
  exclu).
- [x] `CalendarEventCollector` (visites, interventions), `DashboardAgentService` (tâches et visites
  du jour), `Property` (filtres `created_from`/`created_to`), `PaymentController::history()`
  (`paid_at`, `created_at`), `ExportDataService::applyRangeFilter()`.
- [x] Test : `Tests\Feature\Database\TimestampDayRangeTest`.

## Critères d'acceptation

- [x] AC1 — aucune requête des six routes couvertes n'écrit `::date` sur `scheduled_at`, `due_at`,
  `created_at`, `paid_at` ou `earned_at`.
- [x] AC2 — un jour garde sa dernière seconde et exclut le minuit suivant (calendrier, tableau de
  bord, filtre des biens).
- [x] AC3 — la requête des visites du calendrier borne `scheduled_at` dans l'`Index Cond` de
  `property_visits_scheduled_at_status_index`.

## Hors périmètre

- Les colonnes de type `date` (`start_date`, `end_date` des réservations, `period_start` des
  paiements de bail, `due_date` de la balance âgée) : le cast n'y coûte rien, elles gardent
  `whereDate()`. `applyRangeFilter()` sert à la fois des colonnes `date` et horodatées ; la plage y
  est exacte pour les deux, une colonne `date` étant promue en minuit à la comparaison.
- Un index sur les colonnes filtrées qui n'en ont pas (`tasks.due_at`, `booking_payments.paid_at`…) :
  à poser sur mesure, ailleurs.

## Notes d'implémentation

- Hypothèse notée (mode sans humain) : sur une chaîne invalide, `Carbon::parse()` lève là où
  PostgreSQL levait sur le cast ; les deux finissent en erreur, sans validation en amont pour
  `created_from` (inchangé).
- Ablation : le correctif retiré (patch inversé sur `app/`), les 6 gardes `::date` et le plan
  rougissent, les 3 tests de bornes restent verts (ils gardent l'équivalence) ; `after()` ramené à
  `start()`, ce sont les 3 tests de bornes qui rougissent. Remis : 10 verts.
- Le plan avant correctif passait déjà par `property_visits_scheduled_at_status_index`, pour le
  seul `status` : le test exige donc `scheduled_at >=` dans l'`Index Cond`, pas le seul nom.
