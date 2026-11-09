---
id: TCK-2502
title: Demande de visite publique par jour et tranche de la journée, l'heure fixée par l'agent
status: done
phase: P1
family: back
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-09
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

- [x] Migration `add_preferred_window_to_property_visits_table` (string(16) nullable).
- [x] Enum `App\Models\Enums\VisitWindow` (il n'existe pas de `App\Enums`) (morning 09:00, afternoon 14:00, evening 17:00 — début de tranche).
- [x] `VisitRequestPublicPropertyRequest` : règles exclusives `scheduled_at` / `date` + `preferred_window`.
- [x] `PublicPropertyController::visitRequest` : enregistrement de la tranche.
- [x] Confirmation / replanification : fixe l'heure, remet `preferred_window` à `null`.
- [x] Rappels et calcul des créneaux : ignorent les visites à heure non fixée.
- [x] Ressource de visite : expose `preferred_window`.
- [x] Tests : `PublicVisitRequestWindowTest` (création, exclusivité, tranche passée refusée), `VisitWindowConfirmationTest`, `VisitRemindersSkipUnfixedTest`, `VisitSlotsIgnoreWindowTest`.

## Critères d'acceptation

- [x] AC1 — Une demande `date` + `afternoon` crée une visite `scheduled_at` à 14:00 (Dakar) avec `preferred_window = afternoon`. — `PublicVisitRequestWindowTest::test_une_demande_par_tranche_cree_la_visite_au_debut_de_la_tranche`
- [x] AC2 — `scheduled_at` et `preferred_window` ensemble → 422 ; aucun des deux → 422. — `PublicVisitRequestWindowTest::test_l_heure_et_la_tranche_sont_exclusives`
- [x] AC3 — L'agent confirme à 15:30 : `scheduled_at` vaut 15:30 et `preferred_window` est `null`. — `VisitWindowConfirmationTest::test_confirmer_a_15h30_fixe_l_heure_et_leve_la_tranche`
- [x] AC4 — Aucun rappel « 1 h avant » n'est planifié pour une visite à heure non fixée. — `VisitRemindersSkipUnfixedTest`, `VisitWindowConfirmationTest::test_la_visite_confirmee_est_rappelee_pour_l_heure_fixee`

## Hors périmètre

- Les disponibilités déclarées par l'agent (approche B, non retenue).
- L'écran (TCK-2503).

## Notes d'implémentation

**Mesures avant de coder (2026-11-09, `feat/audit-ux-vague-1`)** — ce que le ticket affirmait, ce que le code rend :

- `App\Enums\` n'existe pas : les enums de modèle vivent sous `App\Models\Enums\` (`VisitStatus`, `VisitType`). `VisitWindow` y est rangée.
- La route existe telle que citée : `POST /api/public/properties/{slug}/visit-request` (`routes/api/public.php:165`), règles dans `VisitRequestPublicPropertyRequest` (`scheduled_at` requis, `after:now`, `CreneauDeVisite` : grille 09:00–18:30 par 30 min à Dakar).
- **Les créneaux (`visit-slots`) et le garde de chevauchement ne comptent déjà que les visites `confirmed`**, et **les rappels (`SendPropertyVisitReminders`) ne visent déjà que `confirmed`** : une visite à tranche, née `scheduled`, n'occupe rien et n'est rappelée par rien tant qu'elle n'est pas confirmée. La contrainte tient donc par l'invariant « confirmer fixe l'heure » ; les filtres `whereNull('preferred_window')` posés en plus dans `availableSlots`, `assertNoOverlap` et le rappel sont une ceinture (une visite confirmée par un autre chemin — `update` ne change pas le statut, mais une écriture directe le pourrait).
- **La confirmation n'acceptait aucun corps** (`POST /property-visits/{id}/confirm`) : elle prend désormais `scheduled_at` facultatif, **exigé** pour une visite à tranche (422 `visit.time_required`). Sans cela, confirmer une tranche aurait confirmé le début de tranche (09:00/14:00/17:00) comme une heure réelle.
- La notification `visit.requested` disait « Créneau demandé : 14:00 » : une visite à tranche part sous un **code neuf `visit.requested_window`** (« Demande de visite : … — le 10 novembre 2026, l'après-midi, heure à fixer »), paramètre `window` de nature neuve `visit_window` rendue par l'API sous `visits.windows.<code>`. Côté cloche, le front n'a pas de rendu de cette nature : il reçoit le code brut (`afternoon`), que le corps ICU lit par un `select` — aucun fichier front de code n'est touché, seules les clés `notifications.codes.visit.requested_window` (par l'outil).

**Décisions non évidentes**

- **Exclusivité** : `prohibits` est posé des deux côtés (`scheduled_at` interdit `date`/`preferred_window`, et l'inverse). Mesuré par ablation : retirer un seul côté laisse le test vert (l'autre couvre), retirer les deux le rougit.
- **Tranche entamée** = son début (09:00 / 14:00 / 17:00, Dakar) est passé (`TrancheDeVisite`). Borne des 30 jours : aujourd'hui inclus, J+30 inclus, J+31 refusé.
- **Dédoublonnage (TCK-1410)** : une demande rejouée « même jour, même tranche » rend la visite déjà ouverte ; « l'après-midi » et « 14:00 précis » le même jour ne se confondent pas, bien qu'ils partagent `scheduled_at` (la tranche entre dans la comparaison).
- **La tranche tombe dès que l'heure change** (`PropertyVisit::booted`, comme les marques de rappel de TCK-1527) : confirmation avec heure, déplacement par l'agence (`PATCH`), report par le visiteur (`/reschedule`). Une seule règle, pas trois.
- **Revue (2026-11-09) — la tranche tombe aussi quand l'heure fixée ÉGALE le début de tranche** (confirmer « 14:00 » une demande d'après-midi) : `scheduled_at` ne change pas, le crochet du modèle ne voyait rien et la visite gardait sa tranche. `confirmOrFail`, `rescheduleOrFail` et `PropertyVisitController::update` posent désormais `preferred_window = null` explicitement dès qu'une heure est fournie (`CalendarVisitWindowTest::test_confirmee_au_debut_de_tranche_la_tranche_tombe`, `VisitWindowNotificationsTest::test_l_agence_fixe_par_modification_l_heure_du_debut_de_tranche`, ablations rouges). Pour une heure différente, le crochet couvre aussi `update` — retirer la ligne seule laisse le test « 16:15 » vert, c'est attendu.
- **Revue — agenda de la console et flux .ics** (`CalendarEventCollector::visits`, `IcsCalendarRenderer`) : une visite à tranche non fixée sort **sur la journée** (`all_day: true`, `start`/`end` = le jour à Dakar à 00:00:00 ; .ics `DTSTART;VALUE=DATE`), titre « <bien> — l'après-midi, heure à fixer » (`calendar.visit_window_title`), résumé .ics « Visite — <bien> — l'après-midi, heure à fixer » (`calendar.feed.summary.visit_window`, dans la langue du titulaire du flux, composé du titre du bien et non du titre de la console). Jamais 14:00. Confirmée, elle redevient un rendez-vous minuté (`CalendarVisitWindowTest`, 5 tests, ablations rouges).
- **Revue — aucune notification de visite n'affiche une heure non fixée.** Voie la plus sobre qui passe `check-notification-codes.mjs` : deux codes neufs sur le modèle de `visit.requested_window`, **`visit.cancelled_window`** (l'agence annule → le visiteur) et **`visit.cancelled_by_visitor_window`** (le visiteur annule → l'agence), paramètres `{ property, date, window }`, mêmes canaux, préférence et contacts que leurs jumeaux horaires. Balayage des autres codes : `visit.confirmed` exige l'heure (la tranche est tombée) ; `visit.rescheduled` et `visit.rescheduled_by_visitor` ne partent qu'avec une heure fixée (la tranche tombe dans la même écriture) ; `visit.reminder` ignore une visite à tranche (`whereNull`). Testés un par un (`VisitWindowNotificationsTest`, 7 tests ; `FormeDesDatesDeNotificationTest` éprouve les deux codes neufs par leur émetteur).
- **Revue — `scheduled_at: null` envoyé avec une tranche vaut absent** (`nullable` sur `scheduled_at`) ; seul, il reste un 422 (`PublicVisitRequestWindowTest::test_scheduled_at_null_avec_une_tranche_vaut_absent`). Une heure de confirmation passée → 422 `errors.scheduled_at` (`VisitWindowConfirmationTest::test_confirmer_une_tranche_a_une_heure_passee_est_refuse`).
- **L'heure fixée par l'agent n'est pas contrainte à la grille** des créneaux du visiteur (même règle que `UpdatePropertyVisitRequest` : `date`, `after:now`), ni à la tranche demandée.
- Les rappels « 24 h » sont exclus comme les « 1 h » : un rappel la veille d'un début de tranche annoncerait aussi une heure fausse.

**Contrat pour le front (TCK-2503)**

- `POST /api/public/properties/{slug}/visit-request` — corps : SOIT `scheduled_at` (ISO, sur la grille, inchangé), SOIT `date` (`Y-m-d`, jour à Dakar) + `preferred_window` (`morning` | `afternoon` | `evening`), plus les champs visiteur existants. Réponse 201 `{ data: PropertyVisitResource }`, qui porte désormais `preferred_window` (`string|null`). **Quand `preferred_window` n'est pas nul, `scheduled_at` n'est que le début de la tranche : ne pas l'afficher comme une heure** (« mardi 10 novembre, l'après-midi — heure à fixer »).
- 422 (enveloppe de validation, `errors.<champ>`) : `scheduled_at` (ni heure ni tranche ; heure avec tranche), `date` (format, hors des 30 jours — `visits.window_date_out_of_range`), `preferred_window` (valeur inconnue, jour sans tranche, tranche déjà entamée — `visits.window_started`).
- Console : `POST /api/property-visits/{id}/confirm` accepte `{ scheduled_at? }` ; **exigé** pour une visite à tranche, sinon 422 `{ code: "visit.time_required" }`. La réponse rend `preferred_window: null`. `PATCH` et `/reschedule` avec une heure lèvent aussi la tranche.
- Agenda (`GET /api/calendar`) : un événement `type: "visit"` porte désormais `preferred_window` (`string|null`) ; quand il n'est pas nul, `kind: "window"`, `all_day: true`, `start` = `end` = `YYYY-MM-DD 00:00:00`, `title` déjà composé (« <bien> — l'après-midi, heure à fixer ») et `property_title` (le titre du bien seul). Le type front `CalendarEvent.kind` ne connaît que `end | renewal` (baux) : `window` est une valeur de plus, sans effet sur l'existant.
- Annulations d'une visite à tranche : codes `visit.cancelled_window` et `visit.cancelled_by_visitor_window`, paramètres `{ property, date (Y-m-d), window (code) }`, `param_types.window = "visit_window"` ; clés front `notifications.codes.visit.{cancelled_window,cancelled_by_visitor_window}.{title,body}` posées par l'outil (`select` ICU sur `{window}`).
- Notification à l'agence : code `visit.requested_window`, paramètres `{ property, date (Y-m-d), window (code), contact }`, `param_types.window = "visit_window"` (nature inconnue du front : rendue comme texte, puis lue par le `select` ICU de `notifications.codes.visit.requested_window.body`).
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.3 (demande par tranche, heure exigée à la confirmation, ni créneau ni rappel) ; `docs/models-spec.md` § 17 `preferred_window` et enum `VisitWindow`.
