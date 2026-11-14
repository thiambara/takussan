---
id: TCK-2745
title: "Contacts de messagerie : la relation de chaque personne (client, équipe, propriétaire) et sa ligne de détail, pour ranger « Nouvelle conversation »"
status: done
phase: P2
family: back
estimate: M
wave: 87
created: 2026-11-12
updated: 2026-11-14
depends_on: [TCK-2632]
blocks: [TCK-2830]
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
tags: [back, messagerie, audit-ux, app]
---

## Objectif utilisateur

Dans « Nouvelle conversation », l'agent retrouve d'un coup d'œil à qui il écrit : ses clients récents
d'abord, puis son équipe, puis les propriétaires, chacun avec une ligne qui le situe (« Maison avec
jardin · Thiès », « Agent · Dakar Immo », « 4 biens gérés »).

## Constat

- TCK-2632 livre « Nouvelle conversation » avec **une seule liste « Personnes »**, par nom : c'est un
  écart « donnée absente » à la maquette (`app-messagerie`, écran « Nouvelle conversation »), qui range
  les personnes en « Clients récents · Équipe · Propriétaires » avec une ligne de détail.
- `GET /api/conversations/contacts` (`MessagingContactResource`, périmètre de TCK-565) ne rend que
  `id`, `name` et `avatar_url` : ni la relation de la personne avec l'appelant, ni de quoi écrire la
  ligne de détail, ni l'ordre « récent ».

## Delta à produire

- `GET /api/conversations/contacts` rend, pour chaque personne, sa **relation** avec l'appelant dans
  le périmètre de `MessagingReach` : un code parmi `client`, `equipe`, `proprietaire`, `prestataire`
  (une donnée, jamais un libellé : le front possède le texte, principe 5).
- Une **ligne de détail** sous forme de données, pas de phrase : pour un client, le bien de son
  dernier échange (titre, ville) ; pour l'équipe, le rôle dans l'agence ; pour un propriétaire, le
  nombre de biens gérés par l'agence.
- Un `filter[relation]` pour lire une section, et un tri « récent » pour les clients (dernier contact
  ou dernier échange).
- Le front de TCK-2632 range alors la liste en sections, comme la maquette (ticket front à part, ou
  reprise de TCK-2632 si encore ouvert).

## Critères d'acceptation

- [x] Un agent reçoit ses clients, son équipe et les propriétaires de son agence, chacun avec sa
      relation ; une personne hors de son périmètre n'apparaît jamais (garde de TCK-565 inchangée).
      *Preuve : `MessagingContactsRelationTest::test_un_agent_recoit_la_relation_et_la_ligne_de_detail_de_chacun`,
      `…aucune_relation_n_est_lue_dans_une_autre_agence` ; `MessagingContactsTest` (27 tests) vert, ses deux
      épingles de clés étendues à `relation`/`detail` ; la règle 2b de `MessagingReach` est seulement
      extraite en `clientsOf()` (tests de périmètre `OwnerDepartedReachTest`, `MembreRetireMessagerieCrmTest`,
      `FicheClientSupprimeeLienCrmTest`, `ParticipantManagementTest` verts).
      Ablations : agence retirée des prédicats équipe, propriétaire, prestataire, du compte de biens ;
      rattachement de l'appelant retiré de la règle client — chacune rouge.*
- [x] Aucune coordonnée (téléphone, e-mail) dans la réponse, comme aujourd'hui.
      *Preuve : `…test_ne_rend_aucune_coordonnee` (clés exactes `id, name, avatar_url, relation, detail` ;
      détail client `property: {title, city}`).*
- [x] Un client connecté ne reçoit que les relations que `MessagingReach` lui ouvre déjà.
      *Preuve : `…test_un_client_connecte_ne_recoit_que_ce_que_la_messagerie_lui_ouvre`,
      `…test_un_bailleur_ne_lit_ni_proprietaire_ni_prestataire` (ablations de la garde « personnel »
      sur propriétaire et prestataire : rouges).*
- [x] Le compte de requêtes de la route reste borné (pas une requête par personne), mesuré par test.
      *Preuve : `…test_le_compte_de_requetes_ne_depend_pas_du_nombre_de_personnes` (4 puis 24 personnes,
      liste + section client triée : même compte) ; ablation « une requête par personne » : rouge.*

## Notes

- Né de la décision 3 (a) du 2026-11-12 sur TCK-2632 : une liste unique côté front, et ce ticket pour
  la donnée qui manque.

## Notes d'implémentation (2026-11-14)

- `App\Services\Messaging\MessagingRelation` : un code par personne, priorité équipe > propriétaire >
  client > prestataire ; `null` pour un simple correspondant (et pour l'équipe d'une autre agence,
  règle 4). `proprietaire` et `prestataire` au seul personnel de l'agence active.
- `client` = règle 2b de `MessagingReach` (fiche à laquelle l'appelant est rattaché), pas toute la
  clientèle de l'agence.
- « Dernier échange » (bien et tri) : les seuls fils où l'appelant est encore participant, hors fils
  d'une agence fermée au bailleur parti (`MessagingReach::filsFermes()`, rendue publique).
- `proprietaire`/`prestataire` : personnel actif ET policy du carnet (`viewAny`) ; la policy retire
  ce que le personnel ne lit pas : un bailleur délégué `agent` est du personnel sans lire les carnets.
- Tri `sort=-last_exchange_at` (`App\Sorts\LastExchangeSort`) : dernier `last_message_at` des fils que
  l'appelant voit, `NULLS LAST` ; pas `customers.last_contacted_at`, gardé par capacité dans
  `CustomerResource` (oracle).
- Le rangement en sections côté front : TCK-2830 (TCK-2632 est `done`).
- Décisions 1 à 5 (relation `null`, priorité, garde personnel + policy, tri sur le dernier échange,
  client = fiche rattachée) retenues par team-lead le 2026-11-14 ; règles 3 et 5 éprouvées par
  `…test_un_delegue_sans_carnet_ne_lit_ni_proprietaire_ni_prestataire` et
  `…test_le_client_d_un_collegue_n_est_pas_mon_client`, chacune avec son ablation (rouge).
