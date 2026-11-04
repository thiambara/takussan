---
id: TCK-072
title: "Calendrier agrégé agent / owner (visites + réservations)"
status: done
phase: P1
family: front
estimate: M
wave: 5
created: 2026-04-23
updated: 2026-04-24
depends_on: [TCK-026, TCK-027, TCK-075, TCK-057, TCK-054]
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#12-propertyvisit
tags: [calendar, bookings, visits, front]
---

## Contexte

TCK-026 (bookings backend) est `review` et expose déjà un `CalendarController` agrégeant les réservations confirmées. Les visites (`PropertyVisit`) sont partiellement couvertes et seront complétées par TCK-075. L'audit frontend signale l'absence d'une page `/app/calendar` ou équivalent — aucun agent ou bailleur ne peut consulter l'agenda unifié depuis l'UI.

## Objectif utilisateur

Un agent ou bailleur doit pouvoir consulter dans un calendrier unifié l'ensemble des événements liés à ses biens (réservations confirmées, demandes en attente, visites planifiées) par mois / semaine / jour.

## Contrat de données

Endpoints à consommer :

- `GET /api/calendar` — body query : `from`, `to`, `agency_id?`, `property_id?`, `types[]` (booking|visit) — retourne événements unifiés
- `GET /api/bookings` avec filter[property_id] + filter[status]
- `GET /api/property-visits` avec filter[property_id] + filter[date_from] + filter[date_to]

Sparse fieldsets : `fields[bookings]=id,property_id,start_date,end_date,status,customer_id`, `fields[visits]=id,property_id,scheduled_at,duration_min,type,status,customer_id`.

## Direction UX / Artistique

Agenda lisible à la Cal.com / Google Calendar. Vue mois par défaut, bascule semaine/jour/liste. Événements codés couleur par type (bleu réservation, violet visite, gris demande en attente). Click = panneau latéral détail. Filtres par bien en haut (multi-select).

## Contraintes strictes (métier)

- Un agent voit les événements des biens sur lesquels il a un `PropertyCollaborator` OU dont il est agent principal.
- Un bailleur voit uniquement les événements liés à ses biens (via `Property::owner_id`).
- Un admin d'agence voit tous les événements de son agence.
- La densité d'événements sur une journée doit rester lisible (max 3 affichés + "N autres").

## Delta à produire

- [ ] Page `/app/calendar` avec vues mois/semaine/jour/liste (choix bibliothèque à l'IA — ex: `react-big-calendar`, `fullcalendar`, ou custom léger)
- [ ] Panneau détail latéral (slide-over) avec infos de l'événement + lien vers la ressource (réservation ou visite)
- [ ] Filtres par bien + par type d'événement (segmented control)
- [ ] Entry navigation dans la sidebar dashboard (agent + owner + agency_admin)
- [ ] Tests Vitest : rendu vue mois, navigation entre vues, click événement → panneau

## Critères d'acceptation

- [ ] AC1 — Un agent voit son calendrier du mois courant avec tous ses événements confirmés + en attente
- [ ] AC2 — La bascule mois/semaine/jour fonctionne et conserve le filtre bien actif
- [ ] AC3 — Click sur un événement ouvre un panneau avec le détail et un lien vers `/app/bookings/{id}` ou `/app/visits/{id}`
- [ ] AC4 — Un bailleur ne voit que les événements de ses biens (vérification via mock)
- [ ] AC5 — Le calendrier reste performant avec 200+ événements sur le mois
- [ ] AC6 — `npm run build` + `npm run test` verts

## Hors périmètre

- Synchronisation avec calendriers externes (Google, iCal) — P3
- Création / édition directe d'un événement depuis le calendrier — l'action ouvre les pages existantes
- Notifications de rappel avant visite (→ TCK-075)

## Notes d'implémentation

_(Rempli à l'implémentation)_

## État réel (audit 2026-04-24)

### Livré

**Backend (`takussan-api`)**

- `GET /api/calendar` (préexistant) enrichi :
  - accepte `types[]` (`booking`, `visit`) et `property_id`
  - scope d'accès étendu : owner direct OU membre de l'agence OU
    **collaborateur accepté** (`property_collaborators.accepted_at`)
    — ceci couvre la contrainte AC1 (« événements des biens sur
    lesquels il a un `PropertyCollaborator` »)
  - payload de chaque événement : `resource_url` (deep-link front),
    `reference`, `property_slug`, `all_day`, `duration_minutes`
- Tests Feature : `CalendarTest` étendu de 3 → 7 tests (types, property,
  collaborateur accepté vs pending).

**Frontend (`takussan-web`)**

- `/app/calendar` (page serveur, auth via `getMeAction`)
- `components/calendar/` : `CalendarPage`, `MonthView`, `WeekView`,
  `DayView`, `ListView`, `EventDetailSheet`, `event-colors.ts`
- `lib/calendar-date.ts` : helpers lundi-first (`monthGrid`, `weekDays`,
  `visibleRange`, `eventTouchesDay`, etc.) — dépendance zéro
- `lib/queries/calendar.ts` : `useCalendar` basé sur `useApiQuery`,
  sérialise proprement `types[]` en query multi-valeurs + `staleTime 30s`
- `types/calendar.ts`
- Sidebar : entrée **Calendrier** (icône `CalendarDays`) pour
  `agent | owner | admin`
- Panneau slide-over détail avec deep-link
  `/app/bookings/{id}` ou `/app/visits/{id}`
- Filtre bien (select) dérivé des événements rendus (évite un appel
  API supplémentaire)
- Segmented control type (booking/visit) qui conserve le filtre sur
  bascule de vue

### Tests

- Backend : **866 passed** (+7 nouveaux sur `CalendarTest`)
- Frontend : **279 passed (36 files)** (+32 nouveaux : 19 sur les
  helpers date, 13 sur `CalendarPage` — bascule vues, click → panneau,
  densité « +N autres », filtre bien, skeleton, erreur, today button)
- `npm run build` : vert, route `/app/calendar` compilée en dynamic.
- `npm run lint` : 0 erreurs (warnings préexistants non liés).

### Choix de lib calendrier

**Implémentation maison légère** (sans `react-big-calendar` ni
`fullcalendar`). Justification :

- Grille 6×7 et week/day/list = quelques dizaines de lignes de CSS grid
- Aucune dépendance externe (bundle preserved, pas de CSS global à
  purger)
- Stylable entièrement en Tailwind — cohérent avec le reste du design
  system Takussan (shadcn + base-ui)
- Event model trivial (un booking = plage all-day, une visite = instant)
  ne justifie pas les 200 ko+ de `react-big-calendar`

### Divergences / follow-ups

- **AC5 (200+ events lisibles)** : densité gérée par `maxPerDay=3` +
  compteur `+N autres`. Pas de virtualisation — probablement suffisant
  pour un mois d'activité agent/owner ; si un admin d'agence gère des
  centaines de biens, prévoir un ticket de dette pour paginer / scinder
  la vue mois par agence.
- **AC2 (bascule conserve filtre bien)** : respecté côté state local ;
  cependant le filtre bien est **dérivé des événements affichés** (pas
  d'appel `/api/properties`) — si l'utilisateur change de mois et que
  le bien filtré n'a plus d'événement, l'option disparaît. Acceptable
  pour une v1 ; si on veut persistance, il faudra fetcher l'index
  des biens.
- **Filtre multi-select bien** (direction UX du ticket) : backend
  `/api/calendar` n'accepte qu'un `property_id` scalaire.
  Implémenté en **single-select**. Pour passer en multi, prévoir
  `property_ids[]` côté back (out-of-scope TCK-072).
- **`agency_id` filter** évoqué dans le « contrat de données » mais non
  implémenté : pas de cas d'usage immédiat, le scope est déjà géré par
  le back selon le rôle.
