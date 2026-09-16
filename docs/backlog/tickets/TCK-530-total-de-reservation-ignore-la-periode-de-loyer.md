---
id: TCK-530
title: "Le tunnel de réservation multiplie le loyer par le nombre de nuits, quelle que soit la période du loyer"
status: todo
phase: P1
family: bug
estimate: S
wave: 65
created: 2026-09-16
updated: 2026-09-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#5-booking
tags: [front, back, bookings, montants, décision-produit]
---

## Objectif utilisateur

Que le total et l'acompte affichés dans le tunnel de réservation correspondent au prix réel du
séjour, quelle que soit la période à laquelle le loyer du bien est exprimé.

## Contrat de données

Relevé le 2026-09-16 pendant la revue design (groupe E), relu par la session :

- `takussan-web/src/components/bookings/BookingTunnel.tsx` (bloc `totalAmount`) calcule
  `property.price * nights` dès que `contract_type === 'rent'`, **sans lire `property.rent_period`**
  (`daily | weekly | monthly | yearly`, `types/property.ts`). Un bien à 250 000 F / mois réservé
  10 nuits affiche **2 500 000 F**, et l'acompte de 30 % qui en dérive (750 000 F) est faux dans
  la même proportion.
- Ce total est **envoyé tel quel** : `StoreBookingRequest` accepte `total_amount` et
  `deposit_amount` du client (`required|numeric|min:0`) — le serveur ne recalcule rien.
- Exposition actuelle : **aucune page ne lie le tunnel** (`/bookings?property=<slug>`) ; il ne
  s'atteint qu'en tapant l'URL. Le défaut est latent, pas encore vécu.

## Contraintes strictes (métier)

1. **Décision à prendre avant de coder** : le tunnel de réservation courte durée
   (features §1.3) doit-il seulement accepter des biens à loyer `daily` (et `weekly`) ? Un bien
   mensuel ou annuel relève du bail (§1.4), pas de la réservation. Proposition à valider :
   refuser le tunnel (état vide explicite, lien vers le contact de l'agent) pour `monthly` et
   `yearly`, et proratiser `weekly` par 7.
2. Montant décimal en base, jamais recalculé en flottant côté front pour être cru par le serveur
   (principe non négociable n° 3).
3. La règle d'acompte reste 30 % (features §1.3), inchangée.

## Delta à produire

- [ ] Front : `totalAmount` dérive de `rent_period` selon la décision de la contrainte 1 ; le cas
      refusé rend un état explicite au lieu d'un montant.
- [ ] Back : `StoreBookingRequest` / service de réservation recalcule (ou refuse) `total_amount`
      et `deposit_amount` au lieu de les accepter du client — ou le ticket consigne pourquoi c'est
      voulu.
- [ ] Tests : un test front par période ; un test back qui poste un `total_amount` incohérent.

## Critères d'acceptation

- [ ] AC1 — Un bien `daily` à 20 000 F, 3 nuits → total 60 000 F, acompte 18 000 F (inchangé).
- [ ] AC2 — Un bien `monthly` ne produit **jamais** `prix × nuits` : il rend le comportement
      décidé (refus explicite ou proratisation), épinglé par un test qui rougit si le calcul
      actuel revient.
- [ ] AC3 — `POST /api/bookings` avec un `total_amount` qui ne correspond pas au bien et aux dates
      ne crée pas une réservation à ce montant (ablation notée).

## Hors périmètre

- Relier le tunnel depuis la fiche du bien (décision produit distincte).
- L'endpoint `GET /api/bookings/quote` évoqué par features §1.3, sauf si la décision le rend
  nécessaire.

## Notes d'implémentation

_(à remplir par implementing-specs)_
