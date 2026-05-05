---
id: TCK-171
title: Visites & réservations customer — filtre par customer_id, onglets, annulation, timeline
status: todo
phase: P1
family: applicatif
estimate: M
created: 2026-05-05
updated: 2026-05-05
depends_on: [TCK-170]
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#17-propertyvisit
tags: [back, front, visits, bookings]
---

## Objectif utilisateur

Le locataire/acheteur doit retrouver **toutes** ses visites et réservations dans son espace, filtrer par statut, ouvrir leur détail et annuler une demande encore en attente.

## Contrat de données

Findings smoke test 2026-05-05 :

- `/app/visits` ne montre **aucune visite passée** alors que le tenant testé en a 7 en base (`property_visits.customer_id = 133`, `visitor_id = NULL`). La liste filtre probablement par `visitor_id = auth.id`.
- `/app/visits/[id]` retourne « Impossible de charger cette visite » même pour le `customer_id` propriétaire.
- `/app/bookings` n'affiche que 1 réservation sur les 4 du tenant (probablement même mismatch ou pagination par défaut bizarre).
- `/app/bookings/[id]` n'a ni timeline d'événements, ni bouton « Annuler la réservation ».
- Pas d'onglets de filtrage par statut sur ces deux pages (`/app/visits` n'a que `À venir` / `Passées` ; `/app/bookings` n'a aucun filtre).

Endpoints / écrans impactés :

- API listing visites du customer (server-side filter à corriger pour accepter `customer_id`).
- API show d'une visite (autorisation à étendre au `customer_id` propriétaire).
- API listing bookings du customer (vérifier scope).
- Page `/app/visits` : ajouter onglets `Demandées / Confirmées / Passées / Annulées`.
- Page `/app/bookings` : ajouter onglets `En attente / Confirmée / Refusée / Annulée / Expirée`.
- Page `/app/bookings/[id]` : ajouter timeline + CTA `Annuler la réservation` (pour statuts `pending` / `confirmed` selon les règles de cancellation).

## Contraintes strictes (métier)

- Un customer ne voit jamais une visite ou une booking qui n'est pas la sienne (`customer_id = auth.id`).
- L'annulation est possible uniquement si la booking est `pending` (sans frais) ou `confirmed` selon la règle métier — respecter le service `BookingCancellationService` existant ou son équivalent.
- La timeline d'événements lit depuis `activitylog` (spatie) ou les colonnes timestamps existantes (`confirmed_at`, `cancelled_at`, `expired_at`).

## Delta à produire

- [ ] Backend : controller listing visites — filtrer par `customer_id = auth()->id()` (en plus de `visitor_id`) avec union ou OR, selon les conventions `spatie/laravel-query-builder` du projet.
- [ ] Backend : policy / authorization sur show visite — autoriser `customer_id` du visit en plus de `visitor_id` et de l'agent.
- [ ] Backend : idem pour `/api/bookings` listing + show — accepter `customer_id`.
- [ ] Frontend `/app/visits` : 4 onglets `Demandées / Confirmées / Passées / Annulées` avec compteurs et filter `?status=…`.
- [ ] Frontend `/app/visits/[id]` : afficher tous les détails (bien, agent, date, type, statut, message) + bouton `Annuler la visite` (si statut le permet) + section feedback (note + commentaire) pour les visites `completed`.
- [ ] Frontend `/app/bookings` : 5 onglets statuts + colonnes (bien, dates, montant, statut, créée le).
- [ ] Frontend `/app/bookings/[id]` : ajouter timeline d'événements (créée / confirmée / acompte payé / soldée / annulée / expirée), CTA `Annuler la réservation`.
- [ ] Tests backend : 2 customers distincts ne voient pas leurs visites/bookings croisées ; un customer voit ses 7 visites et ses 4 bookings du seed.

## Critères d'acceptation

- [ ] `/app/visits` (onglet `Passées`) liste les 7 visites historiques du tenant testé.
- [ ] `/app/visits/[id]` charge la fiche d'une visite passée du customer sans erreur.
- [ ] Les 4 bookings du customer testé apparaissent dans `/app/bookings` répartis correctement entre les 5 onglets.
- [ ] Cliquer `Annuler` sur une booking `pending` change son statut en `cancelled` (toast OK + ligne mise à jour) et n'applique aucun frais.
- [ ] La timeline de la fiche réservation affiche au minimum `Créée le …` et `Annulée le …` après cancel.

## Hors périmètre

- Câblage des paiements / passerelle (TCK-172).
- Quittances PDF (TCK-172).
- Hydratation `customer_id` à la création (TCK-170).

## Notes d'implémentation

_(à remplir par implementing-specs)_
