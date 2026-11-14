---
id: TCK-2745
title: "Contacts de messagerie : la relation de chaque personne (client, équipe, propriétaire) et sa ligne de détail, pour ranger « Nouvelle conversation »"
status: todo
phase: P2
family: back
estimate: M
wave: 87
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2632]
blocks: []
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

- [ ] Un agent reçoit ses clients, son équipe et les propriétaires de son agence, chacun avec sa
      relation ; une personne hors de son périmètre n'apparaît jamais (garde de TCK-565 inchangée).
- [ ] Aucune coordonnée (téléphone, e-mail) dans la réponse, comme aujourd'hui.
- [ ] Un client connecté ne reçoit que les relations que `MessagingReach` lui ouvre déjà.
- [ ] Le compte de requêtes de la route reste borné (pas une requête par personne), mesuré par test.

## Notes

- Né de la décision 3 (a) du 2026-11-12 sur TCK-2632 : une liste unique côté front, et ce ticket pour
  la donnée qui manque.
