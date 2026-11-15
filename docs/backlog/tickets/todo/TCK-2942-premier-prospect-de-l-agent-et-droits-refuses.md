---
id: TCK-2942
title: "Assistant de l'agent : le premier prospect porte son besoin, son budget, son dernier contact, son origine et la note de l'agence ; les droits refusés sont servis"
status: todo
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2945]
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
    - "docs/models-spec.md#35-agentprofile-"
tags: [back, entree, agent, prospect, capacites, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le nouvel agent sait, dès son arrivée, ce que cherche son premier prospect, avec quel budget, d'où il vient et quand on lui a parlé ; et il voit ce que son rôle ne lui permet pas.

## Contrat de données

Écarts de TCK-2613 (`[1]` classé à tort « donnée de la démo », `[7]` « delta d'API, ticket à part si le porteur le veut »). Relevé du 2026-11-15 : `AgentProfileController::firstLead` (`:229-262`) ne sélectionne que `id, first_name, last_name, email, phone, pipeline_stage` — alors que `customers` porte `seeking_contract_type`, `budget_min/max`, critères de recherche (types, villes, quartiers), `last_contacted_at`, `last_contact_channel`, `source_contact_lead_id`, `interested_property_id`, `notes`. `roleCapabilities` (`:265`) ne rend que les capacités accordées.

- `GET …/first-lead` rend en plus : `need` (contrat, types, quartiers, chambres — les critères de recherche), `budget_min`, `budget_max`, `last_contacted_at`, `last_contact_channel`, `origin` (`{kind: "contact_lead", property_title}` ou la source connue), `agency_note` (la note de l'agence sur la fiche).
- `GET …/role-capabilities` rend `granted` et `denied` (les capacités du catalogue du rôle que ce rôle n'a pas, limitées à la liste affichable de l'assistant).

## Contraintes strictes (métier)

- Lecture par le titulaire du profil seul (`assertOwner`, inchangé) ; la note de l'agence n'est rendue que si elle est visible du personnel (pas une note privée d'un autre agent, selon la règle de `CustomerNote`).
- `denied` vient de la même table de vérité (`MembershipCapabilityResolver`) que `granted` : aucune seconde liste.

## Delta à produire

- [ ] `firstLead` : sélection et projection étendues.
- [ ] `roleCapabilities` : `denied`.
- [ ] Type front `AgentFirstLeadEntry` mis à jour (dans le ticket front TCK-2945).
- [ ] Tests : `AgentFirstLeadProjectionTest`, `AgentRoleCapabilitiesDeniedTest`.

## Critères d'acceptation

- [ ] AC1 — Un prospect qui cherche un 3 pièces à louer à Sacré-Cœur, budget 300 000-400 000, contacté hier par WhatsApp, venu d'une demande sur le bien « Villa Mermoz », avec une note d'agence, est rendu avec ces six informations.
- [ ] AC2 — Un prospect sans aucune de ces données rend les champs à `null` (pas d'erreur) ; une note privée d'un autre agent n'est pas rendue.
- [ ] AC3 — Pour un agent, `denied` contient une capacité réservée à l'admin (p. ex. `payouts.approve`) et jamais une capacité de `granted` ; l'union des deux est le catalogue affichable.

## Hors périmètre

- L'écran (TCK-2945).

## Notes d'implémentation

_(à remplir par implementing-specs)_
