---
id: TCK-2574
title: Fiche d'un propriétaire — l'API sert l'agence qui gère ses biens et son nom abrégé
status: todo
phase: P1
family: api
estimate: S
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [api, directory, privacy, audit-ux]
---

## Objectif utilisateur

Sur la fiche publique d'un propriétaire (`/agents/<slug>`, `public_role: owner`), le visiteur qui
veut écrire est renvoyé à **l'agence qui gère ses biens** (TCK-2523, décision 1b), et la personne
n'y est jamais exposée au-delà d'un nom abrégé (« Sokhna G. »).

## Constat (relevé du 2026-11-09, pile `./dev.sh`)

`GET /api/public/agents/sokhna-g` (propriétaire, 8 biens publics) rend :

- `agency: null` — `PublicAgentController` sert `$agent->agency`, le rattachement de la
  **personne** ; un propriétaire n'en a pas. L'agence qui gère ses biens (celle des biens publiés)
  n'est servie nulle part sur la fiche. Le front (TCK-2523) sait déjà renvoyer le contact à cette
  agence quand elle est servie, et retombe sinon sur le formulaire anonyme du propriétaire.
- `full_name: "Sokhna Gueye"`, `last_name: "Gueye"` — le nom complet sort de l'API ; seul le front
  l'abrège (titre, `<h1>`, contact, données structurées). Un nom de famille servi à un endpoint
  anonyme et énumérable par slug reste lisible par quiconque l'appelle.

## Delta à produire

- [ ] Sur la fiche d'un propriétaire, servir l'agence qui gère ses biens publics (`id`, `name`,
  `slug`) — sous une clé distincte de `agency` (qui reste le rattachement de la personne), ou
  `null` quand ses biens publics relèvent de plusieurs agences ou d'aucune. La règle de choix
  s'écrit dans le ticket au moment de l'implémenter, pas dans le front.
- [ ] Pour un propriétaire, ne plus servir `last_name` ni le nom complet : `full_name` abrégé
  (« Sokhna G. »), `last_name` absent ou réduit à l'initiale. L'agent (`public_role: agent`) garde
  son nom complet.
- [ ] Même règle sur la liste `GET /api/public/agents` (ligne d'annuaire d'un propriétaire listé).
- [ ] Front : lire la nouvelle clé dans `agents/[slug]/page.tsx` (aujourd'hui
  `agenceDuProprietaire = !estAgent ? agent.agency : null`).

## Critères d'acceptation

- [ ] AC1 — Un propriétaire dont tous les biens publics sont gérés par Dakar Immo : la réponse porte
  Dakar Immo comme agence de gestion, et la fiche rend « Écrire à l'agence » vers `/agencies/dakar-immo`.
- [ ] AC2 — Biens publics de deux agences, ou d'aucune : la clé vaut `null`, et la fiche garde le
  formulaire anonyme du propriétaire.
- [ ] AC3 — Le JSON de la fiche et de la liste d'un propriétaire ne contient pas son nom de famille
  (balayage de la réponse) ; celui d'un agent le contient.
- [ ] AC4 — (front + API) La fiche d'un propriétaire géré par une agence propose de contacter l'agence :
  sur la vraie API, « Écrire à l'agence » mène à `/agencies/<slug>` de l'agence qui gère ses biens.
  _AC transféré de TCK-2523 (AC3) par la session le 2026-11-09 : l'API sert `agency: null` pour un
  propriétaire._

## Hors périmètre

- Le numéro du propriétaire : il n'est déjà jamais rendu par le front (TCK-2523, AC3).

## Notes d'implémentation

- 2026-11-09 — transféré par la session : l'AC3 de [TCK-2523](../done/TCK-2523-fiche-d-agent-la-personne-d-abord.md)
  (« son bouton de contact vise l'agence ») devient l'AC4 ici, l'API servant `agency: null` pour un
  propriétaire. TCK-2523 est livré sans lui : la fiche d'un propriétaire garde son formulaire. Le
  front sait déjà rendre le renvoi (`agenceDuProprietaire`, `agents/[slug]/page.tsx`) ; il suffit d'y
  brancher la nouvelle clé.
