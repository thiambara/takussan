---
id: TCK-183
title: Réservations owner — actions accepter/refuser/annuler
status: review
phase: P1
family: front
estimate: M
created: 2026-05-06
updated: 2026-05-06
depends_on: [TCK-026, TCK-043]
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#6-bookingpayment
tags: [front, owner, bookings, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un propriétaire doit pouvoir traiter les demandes de réservation de ses biens depuis la liste et la fiche détail.

## Contrat de données

Les endpoints de cycle de réservation existent via le domaine réservation : consultation des réservations, acceptation, refus, annulation et lecture des paiements liés. L'UI owner doit consommer ces endpoints avec des sparse fieldsets adaptés aux vues dashboard.

## Direction UX / Artistique

Interface de traitement opérationnelle et dense : liste filtrable par statut, fiche détail orientée décision, actions primaires visibles seulement quand le statut le permet, confirmation claire avec champ message/motif.

## Contraintes strictes (métier)

- Les actions `Accepter`, `Refuser`, `Annuler` sont visibles uniquement pour les statuts compatibles.
- Le propriétaire ne peut agir que sur les réservations liées à ses biens ou à son profil actif autorisé.
- Le refus et l'annulation doivent permettre un motif lisible côté client.
- Les paiements liés à une réservation restent consultables sans exposer de données hors portefeuille.

## Delta à produire

- [ ] Liste `/app/bookings` owner : conserver les onglets statuts et afficher les champs utiles au traitement.
- [ ] Fiche `/app/bookings/[id]` owner : ajouter les actions `Accepter`, `Refuser`, `Annuler` selon le statut.
- [ ] Confirmation d'acceptation avec message optionnel au client.
- [ ] Confirmation de refus/annulation avec motif.
- [ ] Section paiements de réservation avec acompte/solde/statut/méthode/référence.
- [ ] Feedback UI après mutation : statut mis à jour, timeline rafraîchie, toast clair.
- [ ] Tests frontend sur les actions visibles/invisibles par statut et par rôle.

## Critères d'acceptation

- [ ] Une réservation `pending` ouverte par un owner affiche `Accepter` et `Refuser`.
- [ ] Après acceptation, la fiche affiche le statut confirmé sans rechargement manuel.
- [ ] Le refus impose ou propose un motif et affiche ensuite le statut refusé.
- [ ] Une réservation confirmée affiche l'action d'annulation avec motif.
- [ ] Un owner ne voit pas les actions de décision sur une réservation hors portefeuille.
- [ ] Les paiements liés à la réservation sont listés sans requêtes relationnelles séparées évitables.

## Hors périmètre

- Passerelle de paiement client.
- Remboursement automatisé partiel.
- Refonte backend du modèle `Booking`.

## Notes d'implémentation

Le message optionnel d'acceptation est saisi côté UI, mais l'endpoint backend `confirm` ne persiste pas encore ce champ.
