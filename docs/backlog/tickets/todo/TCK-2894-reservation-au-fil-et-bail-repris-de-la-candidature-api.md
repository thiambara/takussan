---
id: TCK-2894
title: "API : la réservation entre au fil de la fiche client, et le bail créé depuis une candidature reprend son loyer, sa durée, sa caution et ses garants"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2870, TCK-2893]
blocks: [TCK-2875, TCK-2878]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#14-lease-"
tags: [back, bookings, crm, leases, fil-commercial, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent lit tout le chemin d'un client de la demande au bail au même endroit, et le bail qu'il crée depuis une candidature acceptée est déjà rempli de ce qu'elle disait.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-reservations e1 historique ; app-fil-commercial e6 « Le fil de {prénom} », e7 « De la demande au bail », panneau « Nouveau bail · repris de la candidature »). Relevé : `CustomerTimeline::TYPES` (`note`, `visit`, `contact`, `stage`, `record`, `task`) ne contient pas la réservation ; le bail créé depuis `?booking_id=` (TCK-2643) ne rattache aucun garant et le formulaire reprend le loyer actuel du bien (`CreateLeaseForm.tsx:208-220`), pas le montant de la candidature. Décisions : [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 9, § 10.

## Contrat de données

- `GET /api/customers/{customer}/timeline?types=booking` (type neuf).
- `POST /api/leases` avec `booking_id` : reprise par défaut de la caution et des garants de la réservation.
- `GET /api/bookings/{booking}` sert déjà ce que le formulaire préremplit (montant, `term_months`, `security_deposit_amount`, `start_date`, garants — TCK-2870, TCK-2893).

## Contraintes strictes (métier)

- Le fil ne sert la réservation qu'au personnel de l'agence de la fiche (même lecture que les visites dans `CustomerTimeline`) ; il ne sert jamais le revenu ni le dossier.
- Le loyer repris est **le montant de la candidature** (le loyer du bien à sa création, ADR-0102 § 3), pas le loyer actuel du bien.
- Une requête de bail qui envoie ses propres garants ou sa propre caution l'emporte sur la reprise.

## Delta à produire

- [ ] `CustomerTimeline` : type `booking` (jalons `created`, `confirmed`, `rejected`, `counter_offer`), rangs, lecture personnel ; `CustomerTimelineRequest` l'accepte.
- [ ] `LeaseService::create` avec `booking_id` : rattache les garants de la réservation quand la requête n'en envoie pas ; reprend `security_deposit_amount` comme caution par défaut et `term_months` pour la date de fin par défaut.
- [ ] Tests : `CustomerTimelineBookingTest` (personnel oui, bailleur hors agence non, ordre avec visites et notes), `LeaseFromBookingTest` (garants et caution repris, surcharges de la requête respectées, loyer de la candidature quand le bien a changé de loyer).

## Critères d'acceptation

- [ ] AC1 — `GET /api/customers/{id}/timeline?types=booking` rend « candidature déposée » puis « candidature acceptée » au personnel de l'agence, rien à un bailleur d'une autre agence.
- [ ] AC2 — Le fil complet d'un client rend, dans l'ordre, la note `lead_message`, la visite confirmée, le compte rendu, le geste d'invitation et la candidature déposée.
- [ ] AC3 — Une candidature créée quand le bien était à 300 000 F, le bien passé ensuite à 320 000 F : `POST /api/leases` avec son `booking_id` sans loyer explicite crée un bail à 300 000 F, avec le garant et la caution de la candidature.

## Hors périmètre

- Les écrans (TCK-2875 historique, TCK-2878 fil commercial et panneau du bail).

## Notes d'implémentation

2026-11-15 — agent délégué (vague 92).

**Prémisses re-mesurées, écarts :**
- Le filtre réel est `filter[type]=booking` (`CustomerTimelineRequest`), pas `?types=booking`.
- `booking_counter_offers` n'existe pas (TCK-2873 non commité) : le jalon `counter_offer` n'est PAS livré ; son rang (11) est réservé dans `CustomerTimeline::RANGS`. À ajouter avec TCK-2873.
- Le « geste d'invitation » d'AC2 n'a pas d'événement propre : c'est un geste de contact (lien `?action=reserver` envoyé par WhatsApp, ADR-0101 § 4) ; aucun `->event()` neuf.
- AC3 exige la reprise du LOYER, que le Delta ne listait pas : livrée (`monthly_rent` ← `total_amount`).
- Un garant passé en `guarantor_id` n'entre pas au pivot `lease_guarantor` (colonne héritée seulement) — inchangé.

**Livré :**
- `CustomerTimeline` : type `booking`, jalons `created` (`created_at`), `confirmed` (`confirmed_at`), `rejected` (`cancelled_at` ET `status = rejected` — une annulation écrit la même colonne). Au seul personnel (`$staff`), et bornée à `bookings.agency_id = customers.agency_id` (une réservation du même client dans une autre agence n'entre pas). Charge utile en colonnes nommées : nature, statut courant, référence, montant, devise, début, bien — jamais revenu, dossier ni garants.
- `LeaseService::create` avec `booking_id` d'une CANDIDATURE : reprend `monthly_rent` (montant de la candidature), `deposit_amount` (`security_deposit_amount`) et `end_date` (début + `term_months` − 1 jour, convention de continuité de `LeaseRenewalService`) quand la clé est ABSENTE de la requête — un `0` ou un `null` envoyés l'emportent. Séjour et offre : rien repris. Garants de la réservation rattachés au pivot quand la requête n'envoie pas `guarantor_id`, sous le prédicat du garant nommé (`view` + `ContactDeLAgenceDuBien::garant`) : un bailleur qui ne lit pas le garant saisi par l'agent ne le rattache pas.
- Front : `TYPES_DU_FIL` gagne `booking` (garde de parité `customer-timeline.tck-2589.test.ts`) et le type `ReservationDuFil` ; aucun rendu (TCK-2878).

**Mesures :** `CustomerTimelineBookingTest` 6/6, `LeaseFromBookingTest` 5/5 ; 12 ablations rouges puis restaurées (md5). `CustomerTimelineTest` : le test du filtre mal formé utilisait `booking` comme type inconnu → passé à `lease`. Tests voisins (3 fils, 4 baux depuis réservation, 3 gardes d'architecture) verts ; vitest du fil 29/29 ; `tsc` propre.

**Pour TCK-2878 :** `fil-du-client.ts:51` et la clé React de `FilDuClient.tsx:470` ne mettent le jalon dans la clé que pour `visit` — deux jalons d'une même réservation s'y écraseraient. `Entree` n'a pas de cas `booking` : les entrées sont servies et tues jusqu'à TCK-2878.

**À confirmer par le porteur :** ADR-0110 § 3 dit « les garants sont rattachés » sans condition ; la reprise applique le prédicat du garant nommé (lisible par le créateur, de l'agence du bien). Un bailleur qui crée le bail ne rattache donc pas, en silence, le garant saisi par l'agent. Retirer ce filtre tient en une ligne (`LeaseService::garantsRepris`).

**Contrat pour TCK-2878 :** la reprise ne vaut que pour une clé ABSENTE ; `null` ou `0` envoyés l'emportent (`guarantor_id: null`, lui, laisse reprendre les garants). `CreateLeaseForm` envoie toujours `deposit_amount` (défaut 0) et `monthly_rent` (loyer actuel du bien) : le panneau « repris de la candidature » doit les préremplir depuis `GET /api/bookings/{id}` ou omettre la clé. `end_date` vide part omise : la fin reprise s'applique.

**Re-mesure des restes (ECARTS-2, 2026-11-16)** — le reste « le formulaire écrase loyer et caution » est fermé par TCK-2878 (1520bb305) : `CreateLeaseForm.tsx:243` prend `termesDuBailRepris(reservation)` (loyer, caution, début, fin de la candidature) et `:539-563` n'applique ni défaut ni caution recalculée sur une clé reprise (test `CreateLeaseForm.bail-repris.tck-2878`). Clés du fil : `cleDeLEntree` (`fil-du-client.ts:51`, type-id-jalon-contre-offre, TCK-2876) sert de `key` (`FilDuClient.tsx:510`) ; le cas `booking` est rendu (`:278`). Rien à corriger.
