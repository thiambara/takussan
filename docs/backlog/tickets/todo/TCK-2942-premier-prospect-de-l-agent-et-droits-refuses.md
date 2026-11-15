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

**Livré (2026-11-15).**

- `App\Services\Onboarding\AgentFirstLead` (neuf) : la recherche (heuristique `added_by_id`, inchangée) et la
  projection du premier prospect, **partagées** par `GET …/first-lead` et par `complete()`
  (`AgentOnboardingService::resolveFirstLead`, qui avait sa propre copie) — le type front `AgentFirstLeadEntry`
  vaut donc pour les deux réponses.
- Champs ajoutés : `need` (`{contract_type, property_types, cities, neighborhoods, min_bedrooms}` ou `null` si aucun
  critère), `budget_min`/`budget_max` (chaînes `decimal:2`, comme `CustomerResource`), `last_contacted_at`
  (instant `instantOnWire`), `last_contact_channel`, `origin`
  (`{kind: "contact_lead"|"interested_property", channel, received_at, property_id, property_title, property_reference}`
  ou `null` ; bien supprimé lu `withTrashed`), `agency_note` (`{body, author_name, created_at}` ou `null`).
- `role-capabilities` : `granted` (= `capabilities`, gardée pour les lecteurs actuels) et `denied` =
  `Capability::agencyAssignable()` moins `granted`. Le « catalogue affichable » est ce catalogue d'agence, sans
  seconde liste (les réservées plateforme n'y sont pas).

**Prémisse qui différait.** `customer_notes` n'a **aucune notion de note privée** (pas de colonne, pas de règle
d'auteur) : la seule règle de lecture est `CustomerNoteKind::staffOnlyValues()` (compte rendu de visite, message
d'origine). Décision (option la plus sûre) : `agency_note` = la dernière note **libre** (`kind` nul), épinglée
d'abord ; jamais une note `visit_report`/`lead_message` (le profil est `draft`, pas encore du personnel) ni une note
d'étape (`conversion`, `loss`) ; à défaut, la colonne `customers.notes` sans auteur. Pas de filtre par auteur (la
maquette signe la note de l'invitant). AC2 est écrit contre cette règle.
`agency_role_id` est NOT NULL : le cas « sans rôle » est défensif et n'a pas de test.

**Mesures.** `AgentFirstLeadProjectionTest` 6/6, `AgentRoleCapabilitiesDeniedTest` 2/2, `AgentRoleCapabilitiesTest` 3/3,
`AgentOnboardingTest` 11/11, `DateInventoryByValueTest` 25/25, les trois gardes d'architecture vertes, gardes racine
`scripts/check-*.mjs` toutes vertes. Ablations (rouges, restaurées md5) : colonne `source_contact_lead_id` retirée de
la sélection → AC1 rouge ; `whereNull('kind')` retiré → AC2 (notes réservées) rouge ; `denied` vide → AC3 rouge ;
ancienne projection remise dans `AgentOnboardingService::resolveFirstLead` → `AgentOnboardingTest::test_complete_flips…`
rouge (assertion TCK-2942 ajoutée : `complete()` porte les mêmes clés). Le test de projection tourne sur un profil
`draft` (l'état réel pendant l'assistant). Les 49 capacités du catalogue ont toutes leur libellé
`admin.roles.capabilities.*` (fr) : `denied` est affichable tel quel par TCK-2945.
