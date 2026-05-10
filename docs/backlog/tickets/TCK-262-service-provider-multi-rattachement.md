---
id: TCK-262
title: "Multi-rattachement Service Provider à plusieurs agences"
status: todo
phase: P2
family: back
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-260, TCK-261]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
    - "docs/models-spec.md#39-serviceprovideragencycollaboration-"
tags: [back, service-provider, multi-tenant, p2]
---

## Objectif utilisateur

Un Service Provider qui travaille déjà avec une agence A doit pouvoir être invité par une agence B et **ajouter cette nouvelle agence à son périmètre** — sans dupliquer son compte, son KYC, ni ses métiers/zones/tarifs.

## Contrat de données

Modèle existant `ServiceProviderAgencyCollaboration` (§39) — une ligne par couple (sp_profile_id, agency_id). Statut `active`, `paused`, `ended`.

Endpoint :

- `POST /api/sp/collaborations/{invitation_token}/accept` — acceptation d'une nouvelle invitation par un SP existant. Si l'email de l'invitation correspond à un user existant ayant déjà un `ServiceProviderProfile`, on **ne crée pas de nouveau profil** : on crée seulement une nouvelle `ServiceProviderAgencyCollaboration` rattachant son profil existant à la nouvelle agence.

## Contraintes strictes (métier)

- Un même `ServiceProviderProfile` peut avoir N collaborations actives.
- Le KYC est porté par le `ServiceProviderProfile` (pas par la collaboration) — donc réutilisé.
- Les métiers/zones/tarifs sont portés par le profil — par défaut réutilisés. Le SP peut **override par agence** via une future fonctionnalité (hors scope MVP).
- Lors de l'acceptation, l'agence inviteuse voit le SP comme "nouveau membre" mais l'historique côté SP est cumulé.
- Conflit : si une collaboration `active` existe déjà entre ce SP et cette agence → 409 (déjà rattaché).
- Activity log : `sp_collaboration_added`.

## Delta à produire

- [ ] Endpoint `POST /api/sp/collaborations/{token}/accept`
- [ ] Modification de `InvitationService::accept` pour détecter le cas SP-existant et créer collaboration au lieu de profil
- [ ] Tests backend :
  - SP nouveau → flow normal TCK-260/261 (création profile + collaboration)
  - SP existant invité par nouvelle agence → réutilisation profil + nouvelle collaboration
  - Doublon collaboration active → 409
  - Listage des collaborations d'un SP : cross-agences avec scoping correct
- [ ] Mise à jour du wizard SP (TCK-261) : si profil existant détecté, skip ou pré-remplir step 2
- [ ] Activity log entry

## Critères d'acceptation

- [ ] AC1 — SP existant accepte invitation d'une nouvelle agence → 1 nouvelle collaboration, pas de nouveau profil.
- [ ] AC2 — Le SP voit ses 2 agences listées dans son menu compte (switch d'agence active).
- [ ] AC3 — Les agences voient chacune le SP avec le bon statut local (`active` côté agence A même si suspendu côté agence B).
- [ ] AC4 — Doublon collaboration active rejeté.
- [ ] AC5 — Activity log entry.

## Hors périmètre

- Override par agence des métiers/zones/tarifs (settings locaux) — V2.
- UI SP pour comparer ses agences ou switcher (déjà couvert par profil actif TCK-138→142).

## Notes d'implémentation

_(à remplir par implementing-specs)_
