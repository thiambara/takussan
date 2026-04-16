---
id: TCK-043
title: "Réservations — Frontend tunnel"
status: todo
phase: P1
family: front
estimate: M
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-054, TCK-056, TCK-057, TCK-059, TCK-026]
blocks: []
spec_refs:
  features: [docs/features.md#13-réservations-courte-durée--visites]
  models:
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#6-bookingpayment
tags: [front, booking, stepper, payment]
---

## Objectif utilisateur

Un locataire peut demander une réservation en parcourant un tunnel clair et rassurant.

## Contrat de données

- `POST /api/bookings` — créer une réservation
- `GET /api/bookings/{booking}` — consulter
- `POST /api/bookings/{booking}/payments` — enregistrer un acompte
- `GET /api/properties/{property}` — données du bien à réserver
- Endpoints publics et authentifiés selon le contexte

## Direction UX / Artistique

- **Stepper multi-étapes** : sélection dates → confirmation montants → acceptation conditions → soumission. L'IA choisit le composant stepper et la gestion d'état du formulaire multi-étapes.
- **Récapitulatif** : toujours visible (sidebar sticky sur desktop) montrant le bien, les dates et les montants.
- **Progression** : indicateur visuel d'avancement (étapes 1/2/3/4).
- **Confirmation** : écran de succès avec récapitulatif et prochaines étapes.

## Contraintes strictes (métier)

- Impossible de soumettre si une étape obligatoire est invalide
- Montants affichés en XOF avec formatage localisé
- L'utilisateur doit être connecté pour réserver (redirection vers login si anonyme)
- Les dates doivent être cohérentes (date fin > date début)

## Delta à produire

- [ ] Page tunnel de réservation (stepper multi-étapes)
- [ ] Récapitulatif sticky du bien et des montants
- [ ] Indicateur de progression
- [ ] Écran de confirmation/succès
- [ ] Redirection auth si non connecté

## Critères d'acceptation

- [ ] Le stepper empêche la progression si une étape est invalide
- [ ] Les montants sont affichés en XOF formaté
- [ ] Un utilisateur anonyme est redirigé vers login
- [ ] L'écran de succès affiche le récapitulatif

## Hors périmètre

- Backend réservations (→ TCK-026)
- Calendrier de disponibilités (→ P2)
- Annulation avec remboursement (→ P3 futur)
