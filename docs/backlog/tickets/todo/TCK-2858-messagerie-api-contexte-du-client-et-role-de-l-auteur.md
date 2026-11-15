---
id: TCK-2858
title: "Messagerie, côté API : le contexte d'un fil dit le projet du client, sa dernière visite, son premier contact et la demande de contact liée ; un message de groupe dit le rôle de son auteur ; « Lu » se lit"
status: todo
phase: P1
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2860]
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#18-conversation-"
    - "docs/models-spec.md#19-conversationparticipant-"
    - "docs/models-spec.md#20-message-"
tags: [back, messagerie, crm, audit-ux, app]
---

## Objectif utilisateur

L'agent qui répond à un client voit, à côté du fil, ce qu'il cherche, quand il a visité et d'où il vient ; dans un groupe, il sait qui parle (« Fatou Wade · locataire ») ; et il sait si son message a été lu.

## Contrat de données

Relevé le 2026-11-15 (`dev` 8c60f4c58) :

- `GET /api/conversations/{conversation}/context` (`ConversationThreadContext`, TCK-2630) : bien, bail, intervention, fiche client `{id, full_name, stage, phone, assigned_agent}` — **ni projet, ni dernière visite, ni premier contact, ni demande de contact liée**. La fiche TCK-2632 l'a rangé en « donnée » alors que `/context` ne porte pas ces champs.
- `Customer` porte `source_contact_lead_id`, `interested_property_id` ; l'origine passe par `include=origin` de `CustomerResource`, au seul personnel.
- `MessageResource` : `sender {id, full_name}` seulement — **pas de rôle** dans un groupe ; aucun indicateur de lecture par message, alors que `conversation_participants.last_read_at` existe.

## Contraintes strictes (métier)

- **Contexte** (même autorisation et même règle de bloc qu'aujourd'hui : `null` plutôt que 403, fiche client au seul personnel de l'agence d'un fil `direct`) — `customer` gagne :
  - `project` : le besoin du client tel que la fiche CRM le porte (type, budget, quartiers) ;
  - `last_visit` : `{id, scheduled_at, property_title}` de sa dernière visite passée dans l'agence ;
  - `first_contact_at` et `origin` (canal) ;
  - `contact_lead` : `{id, created_at, property_title}` de la demande de contact liée (`source_contact_lead_id`, ou la dernière demande du même contact sur le bien du fil), si l'appelant peut la voir.
- **Rôle de l'auteur** : dans un fil `group`, chaque message porte `sender.role_label_code` — un **code** (`tenant`, `owner`, `agent`, `agency_admin`, `service_provider`, `customer`), jamais un libellé (principe 5), dérivé de la relation du participant au fil (comme `InfosDuGroupe` le fait pour la colonne).
- **Lu** : dans un fil `direct`, chaque message envoyé par l'appelant porte `read_by_recipient` (booléen) : vrai si le `last_read_at` de l'autre participant est postérieur à `created_at`. Dans un groupe : `read_count` (nombre de participants qui l'ont lu) — à rendre seulement si la maquette le dessine, sinon noter.
- Pas de N+1 sur `messages` : nombre de requêtes constant entre 10 et 50 messages.

## Delta à produire

- [ ] `ConversationThreadContext` / `ConversationContextResource` : champs ci-dessus.
- [ ] `MessageResource` : `sender.role_label_code` (groupe), `read_by_recipient` (direct).
- [ ] Tests `ConversationContextCustomerFactsTest` (projet, dernière visite, premier contact, demande liée ; client lui-même → `customer = null`) et `MessageReadAndRoleTest` (coche après lecture de l'autre ; rôle `tenant` dans un groupe d'intervention ; requêtes constantes).

## Critères d'acceptation

- [ ] AC1 — Fil de Malick Seck lu par son agent : `customer.last_visit.scheduled_at` est sa visite du 8 novembre, `customer.contact_lead.id` la demande qui l'a créé, `customer.first_contact_at` sa date.
- [ ] AC2 — Même fil lu par Malick : `customer = null` (régression gardée).
- [ ] AC3 — L'agent envoie un message, Malick ouvre le fil (`PUT …/read`) : le message rend `read_by_recipient = true` ; avant : `false`.
- [ ] AC4 — Groupe « Fuite sous évier » : un message de Fatou Wade rend `sender.role_label_code = "tenant"`.
- [ ] AC5 — Ablation : comparer `last_read_at` à l'heure courante au lieu de `created_at` fait rougir AC3.

## Hors périmètre

- Marquer non lu, signaler, ajouter un participant : TCK-2859. Les écrans : TCK-2860.

## Notes d'implémentation

_(à remplir par implementing-specs)_
