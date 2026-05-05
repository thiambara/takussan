---
id: TCK-156
title: "Fiche réservation — masquer le CTA review pour l'agent et afficher la date de création"
status: review
phase: P1
family: front
estimate: S
created: 2026-05-04
updated: 2026-05-04
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations--paiements
  models:
    - docs/models-spec.md#15-booking
tags: [front, bug, p2, smoke-test-2026-05-04, bookings, rbac]
---

## Objectif utilisateur

Un agent ouvre une fiche réservation `/app/bookings/{id}` (notamment terminée) et voit une vue cohérente avec son rôle (gestionnaire) — pas de CTA destiné au booker (« Partagez votre expérience — Laisser un avis ») — et la date de création de la réservation est rendue sous le label `CRÉÉE LE` (actuellement vide).

## Contrat de données

Endpoint : `GET /api/bookings/{id}` — retourne `created_at` (ISO 8601).
Le frontend doit (a) lire `created_at` et le rendre formaté, (b) gater l'affichage du bloc review sur le rôle utilisateur (booker uniquement, pas agent/agence).

## Direction UX / Artistique

- Pour l'agent : la fiche reste centrée sur la gestion (paiements, statut, dates, ref).
- Pour le booker (locataire) : la section « Partagez votre expérience » reste affichée comme aujourd'hui, sans changement.
- Format date : utiliser le helper FR de TCK-153 (`formatDateFR` ou équivalent).

## Contraintes strictes (métier)

- Le rôle est résolu via le contexte d'auth / profil actif (cf. TCK-141 / TCK-143 Frontend multi-profil).
- Si l'utilisateur cumule plusieurs rôles (rare ; agent + booker sur la même réservation) : privilégier le rôle « gestionnaire » (pas de CTA review).
- Le label `CRÉÉE LE` reste rendu même si la valeur est manquante (afficher `—` plutôt qu'une chaîne vide qui casse le layout).

## Delta à produire

- [ ] **Frontend** — `(dashboard)/app/bookings/[id]/page.tsx` : conditionner le rendu de la section `<region "Laisser un avis">` sur `userRole === 'customer'` (ou la résolution équivalente)
- [ ] **Frontend** — Sous le label `CRÉÉE LE`, rendre `formatDateFR(booking.created_at)` (utiliser le helper TCK-153)
- [ ] **Tests frontend** — Test rendu : un compte agent ne voit pas la section review ; un compte booker la voit
- [ ] **Tests frontend** — Test rendu : `CRÉÉE LE` affiche une date formatée

## Critères d'acceptation

- [ ] Un agent connecté avec `agent1@dakarimmo.sn` ne voit plus le bloc « Partagez votre expérience » sur `/app/bookings/319` (réservation terminée)
- [ ] Le label `CRÉÉE LE` rend la date de création formatée FR
- [ ] Un compte locataire conserve l'ancien comportement (CTA review visible sur réservation terminée)

## Hors périmètre

- Refonte de la page fiche réservation (paiements, statut, médias)
- Workflow de soumission d'avis (TCK existant)

## Notes d'implémentation

- Source de reproduction : `docs/smoke-tests/agent-smoke-test-2026-05-04.md`, bug **P2-12**.
- Snapshot a11y `/app/bookings/319` (compte agent) : section `<region "Laisser un avis">` rendue avec heading `Partagez votre expérience` + bouton `Laisser un avis` → cible booker, pas agent.
- Label `CRÉÉE LE` rendu sans valeur (StaticText vide entre le label et `TOTAL`) → bug d'affichage côté frontend (la donnée existe en API).
