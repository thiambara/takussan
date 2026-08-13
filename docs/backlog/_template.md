---
id: TCK-XXX
title: <titre court de la tâche>
status: todo          # todo | doing | review | done | blocked | obsolete
phase: P2             # P0 | P1 | P2 | P3 | EF
family: back          # back | front | applicatif | technique | bug | full | evolution
estimate: M           # S (≤2j) | M (3-5j) | L (6-10j) | XL (>10j)
wave: null            # vague de livraison (numéro) ou `null` — catalogue : waves.json
                      # OBLIGATOIRE : check-backlog.mjs refuse un ticket sans ce champ
created: YYYY-MM-DD
updated: YYYY-MM-DD
depends_on: []        # [TCK-003, TCK-005]
blocks: []            # tickets qui attendent celui-ci
spec_refs:
  features: []        # ["docs/features.md#11-gestion-des-biens"]
  models: []          # ["docs/models-spec.md#3-property"]
tags: []              # [booking, search, back, front]
---

## Objectif utilisateur

_Que cherche à accomplir l'acteur (Locataire, Agent, Bailleur, Visiteur) ?_
_Une seule phrase, orientée résultat utilisateur, pas implémentation._

## Contrat de données

_Quelles données sont disponibles ou à créer ?_
_- Tickets backend : liste des endpoints à créer, modèles et relations impliqués._
_- Tickets frontend : liste des endpoints API à consommer (déjà existants)._
_Référence les specs via `spec_refs` — ne pas recopier les colonnes._

## Direction UX / Artistique

**Tickets frontend uniquement.** Mots-clés d'ambiance, priorités visuelles,
références explicites. **Jamais** de prescription de composants, de state management
ou de structure de dossiers — l'IA décide.

## Contraintes strictes (métier)

_Les règles non négociables : validations, permissions, invariants métier,
règles de sécurité. Tout ce qui doit être vérifié en review._

## Delta à produire

Liste concrète des changements à effectuer :

- [ ] Migration: `add_refund_amount_to_booking_payments`
- [ ] Endpoint: `POST /api/bookings/{booking}/cancel`
- [ ] Service: `App\Services\Booking\BookingCancellationService`
- [ ] Page/section UI: formulaire de réservation
- [ ] Tests: `BookingCancellationTest` (3 scénarios)

## Critères d'acceptation

- [ ] AC1 — formulation testable
- [ ] AC2 — formulation testable
- [ ] AC3 — formulation testable

## Hors périmètre

- Ce qui n'est *pas* traité par ce ticket (évite le scope creep).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

### Règle implementation specs

| Côté | Niveau de prescription |
|------|----------------------|
| **Backend** (Laravel) | **Prescriptif** : noms de migrations, contrôleurs, routes, FormRequests, Policies, noms de tests |
| **Frontend** (Next.js) | **Intentionnel** : reprendre Direction UX + Contrat de données + Contraintes strictes. Ne jamais prescrire noms de composants, structure de dossiers, choix de state management, bibliothèques UI |
