---
id: TCK-2870
title: "API : une candidature porte sa durée, sa caution et ce qu'il faut verser à l'entrée ; une offre son financement, son délai et ses conditions ; les deux disent les autres demandes et les visites du bien"
status: done
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: [TCK-2875, TCK-2876, TCK-2878, TCK-2894]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#5-booking"
tags: [back, bookings, candidature, offre, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent qui décide d'une candidature voit la durée, la caution et ce que le candidat versera à l'entrée ; devant une offre, comment elle est financée, en combien de temps on signe, sous quelles conditions, et où en est le bien (visites, offres reçues).

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`~/takussan-maquettes-sauvegarde/audit-2026-11-15/audit-f5-commercial.md`, app-reservations e1, e3, e4 ; app-fil-commercial e6, e7). La fiche de fidélité de TCK-2594 avait classé « Caution », « Durée », « Financement » en « donnée » : le code ne les rend jamais, aucune colonne ne les porte. Le porteur veut tout : [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 1 les fait entrer au modèle. Le détail des champs n'est pas encore dans `docs/models-spec.md` : à reporter par `/sync-specs`.

## Contrat de données

- `bookings` : colonnes d'ADR-0110 § 1 pour la candidature et l'offre (le séjour est TCK-2892).
- `GET /api/bookings`, `GET /api/bookings/{booking}` : champs neufs dans `BookingResource`, demandables par `fields[bookings]`.
- `POST /api/bookings` (personnel, TCK-2580) et tunnel public `POST /api/public/properties/{slug}/booking-request` (`public.properties.booking-request`) : acceptent les champs de la nature.

## Contraintes strictes (métier)

- [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 1 ; [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md) (une nature n'écrit que ses champs ; § 3 : le montant d'une candidature est le loyer du bien à la création) ; [ADR-0007](../../../adr/0007-pas-d-enum-sql.md) (enum PHP, chaîne en base).
- La caution, les mois d'avance et de frais sont un **instantané du bien à la création** ; caution = `security_deposit_months` × montant de la candidature ; changer le bien ensuite ne change pas une candidature existante.
- « À verser à l'entrée » est **dérivé**, jamais écrit.
- Une colonne qu'une nature n'écrit pas est **refusée** en entrée (422 `booking.field_not_for_kind`), pas ignorée en silence.
- Sparse fieldsets : chaque champ neuf entre à `Booking::$queryFields` et se lit sous `fields[bookings]`.

## Delta à produire

- [ ] Ajouter à ADR-0102 la mention « complété par ADR-0110 » (ligne de statut), sans toucher à sa décision.
- [ ] Migration `add_conditions_to_bookings` : `term_months` (smallint), `renewable` (bool), `security_deposit_months` (smallint), `security_deposit_amount` (decimal 14,2), `advance_months_at_booking`, `agency_fee_months_at_booking` (smallint), `financing` (string), `signature_within_days` (smallint), `conditions` (string 500) — toutes nullables ; `down()` réversible.
- [ ] Enum `App\Models\Enums\OfferFinancing` (`cash`, `mortgage`, `mixed`).
- [ ] `BookingService::create` : instantané caution / avance / frais depuis le bien pour une candidature.
- [ ] `StoreBookingRequest`, `BookingRequestPublicPropertyRequest` : règles par nature (candidature : `term_months` 1-120, `renewable` ; offre : `financing`, `signature_within_days` 1-365, `conditions` ≤ 500).
- [ ] `BookingResource` : les champs, plus `entry_amount` (calculé, candidature seule), `other_pending_on_property` (autres réservations `pending` de même nature sur le bien), `property_visits_count` (visites terminées du bien, tous visiteurs) et `offer_rank` (rang de cette offre parmi les offres reçues sur le bien, 1 = première) — ces trois au personnel de l'agence seul, une requête pour la page (maquette e4 : « En vente depuis 47 jours · 6 visites · première offre reçue », `app-reservations-a.tsx:529`).
- [ ] `visits_on_property` (TCK-2593) : ajouter la date de la dernière visite terminée et son verdict de compte rendu (`report_verdict`, personnel de l'agence seul, ADR-0101 § 3).
- [ ] Tests : `BookingConditionsTest` (une nature n'écrit que ses champs, 422 sinon ; instantané de caution insensible au changement du bien ; `entry_amount` = loyer × max(1, avance) + caution + frais) ; `BookingResourceFieldsTest` (sparse fieldset) ; `BookingPropertyFactsTest` (`other_pending_on_property`, `property_visits_count`, `offer_rank` justes, absents pour le client).

## Critères d'acceptation

- [ ] AC1 — Une candidature créée sur un bien à 300 000 F/mois, `deposit_months = 2`, `advance_months = 1`, sans frais, rend `security_deposit_amount = 600000`, `term_months = 12`, `entry_amount = 900000` ; passer ensuite le bien à `deposit_months = 3` ne change aucune de ces valeurs.
- [ ] AC2 — Une offre créée avec `financing = cash`, `signature_within_days = 30`, `conditions = "Aucune"` les rend telles quelles ; la même requête avec `term_months` rend 422 `booking.field_not_for_kind`.
- [ ] AC3 — Deux candidatures `pending` sur le même bien : chacune rend `other_pending_on_property = 1` au personnel de l'agence ; le client ne reçoit pas la clé.
- [ ] AC4 — `visits_on_property` d'un client qui a visité le bien le 7 novembre, compte rendu « Intéressé », rend cette date et ce verdict au personnel ; le client ne les reçoit pas.
- [ ] AC5 — Sur un bien qui a 6 visites terminées et aucune offre avant, une offre rend `property_visits_count = 6`, `offer_rank = 1` ; la deuxième offre reçue rend `offer_rank = 2`.

## Hors périmètre

- Le séjour : voyageurs, heures, types de paiement (TCK-2892) ; le dossier (TCK-2872) ; garants et revenus (TCK-2893) ; la contre-offre (TCK-2873) ; l'écran (TCK-2875, TCK-2876).

## Notes d'implémentation

Implémenté le 2026-11-15 (arbre `takussan-manques`, vague 92).

- **Où vit la règle** : `App\Services\Booking\BookingConditions` — champs d'entrée par nature, refus
  `booking.field_not_for_kind` (lu sur les données reçues, une clé à `null` vaut une clé absente), instantané du bien,
  `entryAmount()` en bcmath (jamais un flottant). Appelée par les DEUX chemins de création : `BookingService::create`
  (saisie du personnel ; hors saisie, règle du séjour) et `PublicPropertyController::bookingRequest` (offre : avant la
  fiche ; location : sur le bien relu sous verrou, avant la résolution de la fiche).
- **Faits du bien** (`other_pending_on_property`, `property_visits_count`, `offer_rank`) : une requête pour la page dans
  `BookingCustomerFacts::prime`, par ids en SQL ; le rang se calcule sur toutes les offres du bien (tous statuts, hors
  supprimées), date de création puis id. Au seul personnel de l'agence (même porte que `visits_on_property`).
- **Écarts à la prémisse** :
  - `agency_fee_months_at_booking` est `decimal(4,2)`, pas `smallint` : `properties.agency_fee_months` est
    `decimal(4,2)` (un demi-mois de frais existe ; un entier tronquerait l'instantané).
  - `visits_on_property` reste un NOMBRE (le front le lit comme tel : `pieces-du-detail.tsx`, `types/booking.ts`) ; la
    date et le verdict de la dernière visite sortent dans une clé sœur `last_visit_on_property` =
    `{scheduled_at (instant ISO), report_verdict}` ou `null`, mêmes lecteurs. La colonne du verdict s'appelle
    `report_outcome` (`VisitReportOutcome`) ; la clé servie garde le nom du ticket, `report_verdict`. La date est
    `scheduled_at` (le jour de la visite), pas `completed_at` (le jour du compte rendu).
  - `entry_amount` : `null` hors candidature et pour une candidature d'avant TCK-2870 (`term_months` nul, toujours écrit
    depuis) — jamais un montant inventé ; omis sous un sparse fieldset qui ne lit pas toutes ses colonnes
    (`BookingConditions::ENTRY_AMOUNT_COLUMNS`). Les frais d'agence entrent comme loyer × mois de frais.
  - Aucune ligne existante rattrapée (une candidature d'avant n'a pas vu ces conditions).
- **Reste au front** : le code `booking.field_not_for_kind` n'a pas de traduction dans `saisieDemande.codes.booking.*`
  (table explicite de `saisie-de-demande.ts`) ; `types/booking.ts` ne porte pas encore les clés neuves — TCK-2875/2876.
- **Tests** : `BookingConditionsTest` (10), `BookingPropertyFactsTest` (2), `BookingResourceFieldsTest` (3), AC4 dans
  `BookingCustomerFieldsTest` (+2), `BookingResourceContractTest` (clés). Ablations une à une, toutes rouges puis
  restaurées par `md5` : refus par nature, caution sur le prix du bien au lieu du montant, départage du rang par l'id,
  porte du personnel, ordre de la dernière visite, `entry_amount` partiel, candidature d'avant, réservations supprimées
  comptées.
- **Gardes jouées** : les trois d'architecture, `LangGroupParityTest`, `AmountRepresentationTest`, `DateRepresentationTest`
  (verts) ; `DateInventoryByValueTest` : mes quatre clés inscrites (bloc TCK-2870, forme de `last_visit_on_property`
  vérifiée par l'AC4), le test reste rouge sur `DocumentResource::context` (TCK-2895). Joués aussi, non modifiés :
  `StaffRecordsApplicationTest`, `StaffRecordsOfferTest`, `PublicBookingWritesKindTest`, `ModelsTest` (verts).
  `ImpersonationReadSweepTest`, `ValeursEnListeParcoursDesRoutesTest` : CI de la PR.
