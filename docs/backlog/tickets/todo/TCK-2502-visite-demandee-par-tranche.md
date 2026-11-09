---
id: TCK-2502
title: Demande de visite publique par jour et tranche de la journée, l'heure fixée par l'agent
status: todo
phase: P1
family: back
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: [TCK-2503]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [back, visits, audit-ux]
---

## Objectif utilisateur

Le visiteur demande « mardi matin » sans inventer une heure que l'agent ne peut pas tenir ; l'agent fixe l'heure en confirmant.

## Contrat de données

`POST /api/public/properties/{slug}/visit-request` accepte, **à la place** de `scheduled_at`, un couple `date` (jour, heure de Dakar) + `preferred_window` (`morning` | `afternoon` | `evening`). La visite est enregistrée avec `scheduled_at` = début de la tranche et `preferred_window` posé (colonne neuve, cf. `spec_refs.models`). La confirmation par l'agent (flux de confirmation et de replanification existants) fixe l'heure et remet `preferred_window` à `null`. `scheduled_at` seul reste accepté (les appelants actuels ne changent pas).

## Contraintes strictes (métier)

- Exactement un des deux : `scheduled_at`, ou `date` + `preferred_window` → sinon 422.
- `date` dans les 30 prochains jours, pas dans le passé ; une tranche déjà entamée aujourd'hui est refusée.
- Une visite à tranche n'occupe aucun créneau (elle ne bloque pas `visit-slots`) tant que l'heure n'est pas fixée.
- Rappels automatiques (TCK-588) : aucun rappel « 1 h avant » tant que l'heure n'est pas fixée.
- Notifications à l'agent : la tranche est dite (« mardi matin, heure à fixer »).

## Delta à produire

- [ ] Migration `add_preferred_window_to_property_visits_table` (string(16) nullable).
- [ ] Enum `App\Enums\VisitWindow` (morning 09:00, afternoon 14:00, evening 17:00 — début de tranche).
- [ ] `VisitRequestPublicPropertyRequest` : règles exclusives `scheduled_at` / `date` + `preferred_window`.
- [ ] `PublicPropertyController::visitRequest` : enregistrement de la tranche.
- [ ] Confirmation / replanification : fixe l'heure, remet `preferred_window` à `null`.
- [ ] Rappels et calcul des créneaux : ignorent les visites à heure non fixée.
- [ ] Ressource de visite : expose `preferred_window`.
- [ ] Tests : `PublicVisitRequestWindowTest` (création, exclusivité, tranche passée refusée), `VisitWindowConfirmationTest`, `VisitRemindersSkipUnfixedTest`, `VisitSlotsIgnoreWindowTest`.

## Critères d'acceptation

- [ ] AC1 — Une demande `date` + `afternoon` crée une visite `scheduled_at` à 14:00 (Dakar) avec `preferred_window = afternoon`.
- [ ] AC2 — `scheduled_at` et `preferred_window` ensemble → 422 ; aucun des deux → 422.
- [ ] AC3 — L'agent confirme à 15:30 : `scheduled_at` vaut 15:30 et `preferred_window` est `null`.
- [ ] AC4 — Aucun rappel « 1 h avant » n'est planifié pour une visite à heure non fixée.

## Hors périmètre

- Les disponibilités déclarées par l'agent (approche B, non retenue).
- L'écran (TCK-2503).

## Notes d'implémentation

_(à remplir par implementing-specs)_
