---
id: TCK-2735
title: "Seul un séjour occupe des nuits, partout : export iCal, agenda, occupation et clôture des réservations lisent la nature"
status: done
phase: P1
family: back
estimate: S
wave: 89
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2579]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#5-booking"
tags: [back, bookings, calendrier, occupation, suivi-lot-1]
---

## Objectif utilisateur

L'hôte, le bailleur et l'agence qui lisent un calendrier, un taux d'occupation ou un flux iCal n'y voient que des
séjours. Une candidature à une location au mois et une offre d'achat ne s'y affichent pas comme des nuits prises.

## Contexte

[ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md) § 3 pose que **seul un séjour occupe des nuits**.
TCK-2579 l'applique à la disponibilité (`PropertyAvailabilityService::confirmedOverlapQuery`, `kind = stay`). Le
journal du lot 1 (`docs/plans/2026-11-11-audit-ux-app-implementation.md`, entrée TCK-2579) a relevé quatre lecteurs
qui lisent encore les réservations sans leur nature. Re-mesuré dans le code le 2026-11-11 :

| Lecteur | Ce qu'il lit aujourd'hui | Effet d'une candidature ou d'une offre datée |
|---|---|---|
| `Public\IcalExportController` | `bookings` `confirmed`, datées | exportée « Réservé » vers une autre plateforme |
| `Calendar\CalendarEventCollector::bookings()` | `confirmed` et `pending`, datées | une barre de séjour dans « Occupation des biens » |
| `Dashboard\PortfolioMetrics` (CTE `nights`) | `confirmed` et `completed` | des nuits occupées dans le taux d'occupation |
| `Jobs\Booking\CompleteEndedBookingsJob` | `confirmed` avec `end_date` passée | passée à `completed` à sa date de fin |

Le flux iCal n'existe que pour un bien loué à la nuit (`hasHostCalendar`), où une réservation est un séjour à sa
création. L'écart ne s'y produit que pour un bien dont le contrat a changé depuis la réservation. Il est corrigé quand
même, pour que la règle n'ait qu'une forme.

## Contrat de données

Aucune colonne. La nature est `bookings.kind` (`BookingKind`), indexée avec `(agency_id, kind, status)`.

## Contraintes strictes (métier)

- Pour chaque lecteur, la règle est celle de la disponibilité : `kind = stay`.
- Une candidature ou une offre confirmée n'est pas « terminée » par sa date de fin. Son issue est le bail ou la
  vente (ADR-0102 § 3, et `LeaseService` qui solde la réservation à la création du bail). `CompleteEndedBookingsJob`
  ne la touche pas.
- Le job reste idempotent (`routes/console.php`, convention des tâches planifiées). Son commentaire `TCK-NNN` est
  mis à jour.

## Delta à produire

- [ ] `IcalExportController` : `->where('kind', BookingKind::Stay)`
- [ ] `CalendarEventCollector::bookings()` : idem
- [ ] `PortfolioMetrics`, CTE `nights` : `AND b.kind = ?` (séjour)
- [ ] `CompleteEndedBookingsJob::candidates()` : idem, et le commentaire de l'entrée de `routes/console.php`
- [ ] Tests : un cas par lecteur, `ReservationNatureReadersTest` (ou dans les classes existantes de chaque lecteur)

## Critères d'acceptation

- [ ] AC1 — Une candidature confirmée et datée sur un bien n'apparaît ni dans son flux iCal, ni dans les
      événements de l'agenda, ni dans les nuits occupées du taux d'occupation. Un séjour aux mêmes dates y apparaît
      (témoin).
- [ ] AC2 — Une candidature ou une offre confirmée dont la `end_date` est passée reste `confirmed` après
      `CompleteEndedBookingsJob`. Un séjour dans le même cas passe `completed`.
- [ ] AC3 — Ablation, lecteur par lecteur : retirer le filtre de nature rougit le seul cas de ce lecteur

## Hors périmètre

- La règle « une seule candidature acceptée par bien » (TCK-2734, décision du porteur)
- `PlatformReportingService` (compte des réservations confirmées toutes natures confondues, console super-admin)
  et la garde `property.has_confirmed_booking` de `PropertyController` : une offre ou une candidature confirmée y
  compte à juste titre. À revoir seulement si la console sépare les natures.
- L'endroit où une candidature ou une offre se lit dans l'agenda, si elle doit s'y lire : à décider avec l'écran

## Notes d'implémentation

_(À remplir pendant l'implémentation.)_

## Vérification (2026-11-11)

Le premier passage a été refusé : l'onglet Calendrier du bien lisait encore les candidatures et les offres, et l'offre n'était pas couverte par les tests. Le correctif est en ab8762d1d. La contre-vérification, faite par un autre vérificateur, est acceptée : B6, B7 et le mutant de l'occupation rougissent, et l'ablation du filtre `kind` du hook front rougit aussi. Aucun autre lecteur ne peint de nuits. Reste ouvert, hors de ce ticket : où une candidature ou une offre doit-elle paraître dans l'agenda ?
