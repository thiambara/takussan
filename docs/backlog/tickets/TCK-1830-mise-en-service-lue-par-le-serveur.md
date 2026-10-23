---
id: TCK-1830
title: "Le tableau de bord d'agence rend la mise en service et le compte d'invitations au premier affichage, lus par la page serveur"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1828]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-136--lectures-du-navigateur-au-chargement-de-la-console-app-et-super-admin"
tags: [front, agence, performance, pistes]
---

## Contexte

Réf : **P136.05** du fichier de pistes, `validé` par le porteur (V7 accordé). Troisième des trois
tickets de la décision.

Le tableau de bord d'agence (`/app/overview/agency`) est rendu par le serveur, mais la carte
« Mise en service » (`GET /api/agencies/{id}/setup-status`) et le compte d'invitations de la file
« À traiter » partent du navigateur après l'hydratation : la carte, en tête de page, apparaît
après coup.

## Décision du porteur

> porteur (2026-10-22) : trois tickets : les favoris lus au premier abonné du magasin, les lectures de premier affichage passées au serveur, le reste comme l'écrit la recommandation du délégué

Ce ticket porte le troisième point de la recommandation du délégué : « `setup-status` et le
compte d'invitations lus par le tableau de bord serveur, avec un test qui exige la carte de mise
en service au premier rendu ».

## Objectif utilisateur

Un administrateur d'agence voit la carte de mise en service et le compte d'invitations dès le
premier affichage du tableau de bord, sans que la carte décale la page en arrivant.

## Contrat de données

Aucun changement d'API : mêmes requêtes (`/api/agencies/{id}/setup-status`,
`/api/invitations` borné à `per_page=1`), même jeton (`getToken()`), mêmes clés TanStack que les
composants.

## Contraintes strictes (métier)

- La carte garde ses règles : rien sur un refus (un agent reçoit 403) ou une panne ; une
  lecture serveur en échec n'amorce rien, et le navigateur lit comme avant.
- Le compte d'invitations ne se lit pas pour une agence `individual` (même condition que
  `pendingInvitationsCountQueryOptions`).

## Delta à produire

- [ ] Clé et chemin de la mise en service partagés entre `MiseEnService` et la lecture serveur.
- [ ] La page lit les deux en parallèle de `GET /api/dashboard/agency` et les amorce
  (`AmorceLectures`, TCK-1828).
- [ ] Test vitest : la carte et le compte d'invitations au premier rendu de la page.

## Critères d'acceptation

- [ ] AC1 — au premier rendu de `/app/overview/agency`, la carte de mise en service est affichée
  et le compte d'invitations aussi, sans attendre le navigateur.
- [ ] AC2 — `GET /api/dashboard/agency` reste lu une seule fois (AC3 de TCK-647).

## Hors périmètre

- La carte de mise en service de l'accueil `/app` (`(accueil)/page.tsx`), hors du tableau de
  bord nommé par l'entrée.
- Les autres files du tableau de bord (KYC, modération).

## Notes d'implémentation

_(à remplir par implementing-specs)_
