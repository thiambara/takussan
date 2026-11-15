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

- [x] `ConversationThreadContext` / `ConversationContextResource` : champs ci-dessus.
- [x] `MessageResource` : `sender.role_label_code` (groupe), `read_by_recipient` (direct).
- [x] Tests `ConversationContextCustomerFactsTest` (projet, dernière visite, premier contact, demande liée ; client lui-même → `customer = null`) et `MessageReadAndRoleTest` (coche après lecture de l'autre ; rôle `tenant` dans un groupe d'intervention ; requêtes constantes).

## Critères d'acceptation

- [x] AC1 — Fil de Malick Seck lu par son agent : `customer.last_visit.scheduled_at` est sa visite du 8 novembre, `customer.contact_lead.id` la demande qui l'a créé, `customer.first_contact_at` sa date.
- [x] AC2 — Même fil lu par Malick : `customer = null` (régression gardée).
- [x] AC3 — L'agent envoie un message, Malick ouvre le fil (`PUT …/read`) : le message rend `read_by_recipient = true` ; avant : `false`.
- [x] AC4 — Groupe « Fuite sous évier » : un message de Fatou Wade rend `sender.role_label_code = "tenant"`.
- [x] AC5 — Ablation : comparer `last_read_at` à l'heure courante au lieu de `created_at` fait rougir AC3.

## Hors périmètre

- Marquer non lu, signaler, ajouter un participant : TCK-2859. Les écrans : TCK-2860.

## Notes d'implémentation

Implémenté le 2026-11-15 (agent délégué, arbre `takussan-manques`).

**Prémisse re-mesurée** : conforme (`/context` sans projet/visite/premier contact/demande ; `MessageResource.sender = {id, full_name}` ; aucun indicateur de lecture). AC1 cite « Malick Seck » et « sa visite du 8 novembre » : aucun seeder ne les porte, le scénario est rejoué par factories dans `ConversationContextCustomerFactsTest`.

**Choix (à relire par TCK-2860)** :
- `customer.project = {contract_type, property_types[], budget_min, budget_max, cities[], neighborhoods[]}` ou `null` sans aucun critère ; budgets en nombre (comme `property.price`).
- `last_visit` : la plus récente visite déjà passée (`scheduled_at <= now`) de statut `completed`, `scheduled` ou `confirmed` (une visite planifiée jamais close compte), sur un bien de l'agence du fil ; jamais `cancelled` ni `no_show`.
- `first_contact_at` : le plus ancien de `customers.created_at` et de la plus ancienne demande de la fiche (`customer_id` ou `source_contact_lead_id`) ; `origin` = le `channel` de cette demande (`form|whatsapp|call`) seulement quand c'est elle la plus ancienne, `null` sinon (fiche saisie à la main). Aucune notion préexistante de « premier contact » dans le code.
- `contact_lead` : `source_contact_lead_id`, sinon la dernière demande `customer_id` = la fiche sur le bien du fil ; jamais par téléphone/e-mail ; `null` sans `PropertyContactLeadPolicy::view`.
- Tous ces champs suivent `customerReadable` (la règle de `stage`/`phone`, TCK-2724) : `null` sans `CustomerPolicy::view`.
- Messages : `read_by_recipient` (direct, messages de l'appelant ; `null` ailleurs) = `last_read_at` de l'autre ≥ `created_at` (la règle des non-lus de la liste, retournée) ; `read_count` (groupe, messages de l'appelant ; autres membres actuels) — la maquette dessine la coche « Lu » aussi dans le groupe ; `sender.role_label_code` (groupe seulement) dérivé de `RelationsAuFil` jugé pour l'APPELANT (un prestataire n'apprend pas qui est locataire), `agent` → `agency_admin` si administrateur actif d'une agence du fil, `customer` si l'appelant est personnel d'une agence du fil où la personne a une fiche, sinon `null`. Calculés une fois par requête (`FaitsDesMessages`) ; requêtes constantes 10 → 50 messages (direct et groupe).
- Ajout demandé par la session : `GET /api/conversations` rend `last_message.sender_id` (TCK-2853).
- La recherche transverse (`SearchMessageController`) rend ces trois clés à `null` (par construction, `$this->faits?->…` ; non mesuré par un test — les tests de recherche dépendent de Meilisearch, CI).
- Le relevé `after_id` vide ne calcule rien (`FaitsDesMessages` seulement si la page a des messages).
- `ConversationMessageSenderTest` (forme exacte de `sender`) reçoit `role_label_code: null`.

**Reste pour TCK-2860** : le relevé `after_id` ne rafraîchit pas `read_by_recipient` des messages déjà chargés — le front doit relire la page (ou invalider) pour voir la coche passer.

**Ablations** (une à une, restaurées par `cp`, md5 vérifié) : calcul des faits par message → `test_requetes_constantes` rouge ; fiche plus ancienne que la demande ignorée → rouge ; `now()` au lieu de `created_at` (AC5) → rouge ; `last_read_at !== null` seul → rouge ; bail non jugé pour le rôle → rouge ; anciens membres comptés dans `read_count` → rouge ; garde de policy de la demande liée → rouge ; statuts / heure / agence de la dernière visite → rouges ; garde `customerReadable` (projet, faits) → rouges ; repli sur la demande du bien du fil → rouge ; `last_message.sender_id` → rouge.
