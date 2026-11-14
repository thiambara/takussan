---
id: TCK-2766
title: "La fiche client dit par quel canal s'est fait son dernier contact — `last_contact {channel, at}` servi au personnel, pour « Appel il y a 9 j »"
status: done
phase: P2
family: full
estimate: S
wave: 90
created: 2026-11-12
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
tags: [back, front, crm, clients, audit-ux, fidelite]
---

## Objectif utilisateur

Sur les cartes des étapes et sur la fiche, l'agent lit comment il a joint le client pour la dernière fois : « Appel il y a 9 j », « WhatsApp hier », « Visite il y a 3 j ». Aujourd'hui, il ne lit que la durée, « il y a 9 j ». Il ne sait pas s'il a appelé, écrit ou fait visiter.

## Constat

Relevé le 2026-11-12 sur l'arbre de `feat/audit-ux-app-lot-2`.

- **La maquette retenue de TCK-2592 porte le canal**, d'après la fiche de fidélité : « Dernier contact : appel il y a 9 j », « Appel il y a 3 j ». **La décision 5 a de la session du 2026-11-12** a fait rendre au produit la durée seule (« il y a 9 j », « hier »), faute de donnée. Le suivi inscrit dans la fiche de fidélité demande ce ticket.
- **L'API ne sert que l'instant.**
  - `CustomerResource` rend `last_contacted_at`, au seul personnel de l'agence de la fiche (`readsVisits`, vérification adverse de TCK-2583).
  - Aucun champ ne dit le canal.
- **L'instant est écrit par un seul point**, `ContactGestureService::touchCustomer()`, qui n'avance jamais en arrière. Ses appelants sont :
  - un geste de contact sur la fiche ou sur sa demande (`onCustomer`, `onLead`), avec son canal `ContactGestureChannel` : `whatsapp`, `call`, `email` ou `sms` ;
  - une note (`CustomerNoteController`) ;
  - une visite terminée (`PropertyVisitController::complete`) ;
  - un compte rendu de visite (`VisitReportService`).
- **Le canal d'un geste est déjà journalisé**, dans `activity_log.properties.channel` (`ContactGestureService::log`). Il n'existe pas pour une note, une visite ou un compte rendu.

## Contrat de données

- **`customers.last_contact_channel`** : une chaîne nullable, sans `enum()` SQL (ADR-0007). Ses valeurs sont `whatsapp | call | email | sms | note | visit`. Elle est écrite **par la même requête** que `last_contacted_at`, dans `touchCustomer()`, avec la même garde « jamais en arrière ». L'instant et le canal ne peuvent pas diverger.
  - `touchCustomer()` prend le canal en argument. Chaque appelant ci-dessus passe le sien : le compte rendu et la visite terminée passent `visit`.
  - Migration : la colonne, sans reprise de l'existant. Une fiche déjà contactée garde `null` jusqu'à son prochain contact, et l'écran garde alors la durée seule.
- **`CustomerResource`** : `last_contact: { channel: string|null, at: string } | null`, au même lecteur et sous la même borne que `last_contacted_at`. Il est rendu seulement quand `fields[customers]` le demande, comme `next_action` et `follow_up` (TCK-2588). `last_contacted_at` reste, pour les lecteurs existants.
- **Le canal n'est jamais une coordonnée**, comme dans le journal : ni numéro ni adresse.

## Direction UX / Artistique

- **Les cartes des étapes et la fiche** disent « {Canal} {il y a N j} » quand le canal est connu, la durée seule sinon. Exemples : « Appel il y a 9 j », « WhatsApp hier », « Note il y a 2 j ».
- **Les libellés de canal** viennent du front (principe 5) : `fr` / `en`, et en `wo` le texte français tel quel.
- **La maquette de TCK-2592 fait foi** pour la place et le style (ADR-0106). La fiche de fidélité retire l'écart « décision 5 a ».

## Critères d'acceptation

- **AC1.** Un geste `call` sur une fiche donne `last_contact = { channel: 'call', at }` au personnel de l'agence. Le bailleur auteur de la fiche lit `null`.
- **AC2.** Un geste plus ancien que le dernier contact ne change ni l'instant ni le canal. Le test le vérifie sur la ligne en base, pas sur l'instance.
- **AC3.** Une note, une visite terminée et un compte rendu posent respectivement `note`, `visit` et `visit`.
- **AC4.** Une fiche contactée avant la migration rend `last_contact.channel = null` avec son instant. L'écran dit la durée seule.
- **AC5.** La carte des étapes affiche « Appel il y a 9 j » pour une fiche au canal `call`.
- **AC6.** Chaque AC a son ablation rouge.

## Hors périmètre

- Le tri ou le filtre par canal.
- La reprise de l'historique depuis `activity_log`. Elle serait possible pour les gestes, jamais pour les notes et les visites. Elle est écartée : une reprise partielle mêlerait deux vérités.

## Décisions (team-lead, 2026-11-13)

- **Périmètre : le pipeline seul (a).** Relevé du 2026-11-13 sur HEAD : la fiche client ne dit nulle part son dernier contact. `ATTRIBUTS_CALCULES_DE_LA_FICHE` (`src/lib/queries/customers.ts`) demande `next_action`, `follow_up` et `referent`, jamais `last_contacted_at`. Aucun fichier de `components/customer-dashboard/fiche/` ne lit `follow_up` ni `last_contacted_at`, et la maquette de la fiche (`app-clients-fiche.tsx`) n'a pas de ligne « dernier contact » : seul le fil y dit « Appel sortant · 4 min ». Le canal se lit donc là où la durée se lisait déjà : la carte du kanban, la liste du bureau et la vue Étapes du téléphone, toutes trois par `components/pipeline/lecture.ts`.
- **Migration** appliquée par back-3 sur la base de dev le 2026-11-13, avec l'accord de team-lead : elle était la seule en attente. Aucune reprise de l'existant, aucune écriture sur les lignes.

## Notes d'implémentation

- Le canal a son propre type, `LastContactChannel` (les quatre gestes, plus `note` et `visit`), distinct de `ContactGestureChannel`. Ainsi `note` et `visit` ne deviennent pas des gestes qu'on poste (`StoreContactGestureRequest`).
- `last_contact` est un attribut calculé de `CustomerCommercialAttributes` (`FIELDS`). Il est lu par sa propre requête pour la page, car la liste ne charge que les colonnes demandées (TCK-2756). Son lecteur est celui de `last_contacted_at` (`Customer::criteriaBelongTo`, dont l'auteur d'une fiche sans agence), et `at` passe par `BaseResource::instantOnWire`.
- Le pipeline demande `last_contact` à la place de `last_contacted_at`, dont il porte l'instant. Un canal `null` (contact antérieur) laisse la durée seule : « Contacté il y a 8 j ».
- Tests : `tests/Feature/Crm/DernierContactEtSonCanalTest.php` (AC1 à AC4, 9 tests, chaque contact partant d'un canal différent de celui attendu) et `PageDuPipeline.tck-2592.test.tsx` (AC5). Douze ablations API et quatre ablations front sont rouges (AC6).
