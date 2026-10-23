---
id: TCK-1828
title: "L'accueil de /super-admin rend ses files, ses métriques et son activité récente au premier affichage, lues par la page serveur"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-136--lectures-du-navigateur-au-chargement-de-la-console-app-et-super-admin"
tags: [front, super-admin, performance, pistes]
---

## Contexte

Réf : **P136.05** du fichier de pistes, `validé` par le porteur (V7 accordé). Deuxième des trois
tickets de la décision.

L'accueil de `/super-admin` est rendu sans aucune donnée : les quatre comptes des files
(`ConsoleQueues`), les métriques (`SystemMetricsGrid`) et les cinq dernières entrées d'audit
(`ConsoleRecentActivity`) partent du navigateur après l'hydratation, six appels au relais
`/api/super-admin/*`.

## Décision du porteur

> porteur (2026-10-22) : trois tickets : les favoris lus au premier abonné du magasin, les lectures de premier affichage passées au serveur, le reste comme l'écrit la recommandation du délégué

Hypothèse notée (pas de question possible) : « les lectures de premier affichage passées au
serveur » couvre les deux chantiers que la recommandation du délégué sépare ; ce ticket porte le
premier, « les six lectures de l'accueil `/super-admin` passées en données initiales lues par la
page serveur », TCK-1830 le second (mise en service du tableau de bord d'agence).

## Objectif utilisateur

Un opérateur qui ouvre l'accueil de la console voit ses files, ses métriques et l'activité
récente dès le premier affichage, sans squelette ni six allers-retours du navigateur.

## Contrat de données

Aucun changement d'API. La page lit, avec le jeton de l'opérateur (celui du relais
`/api/super-admin/*`), les mêmes six requêtes `/api/admin/*` que le navigateur, mêmes paramètres.

## Contraintes strictes (métier)

- Mêmes données, mêmes clés TanStack : la barre latérale et les invalidations après une décision
  continuent de s'appliquer ; les files gardent leur rafraîchissement d'une minute.
- Une lecture serveur en échec n'amorce pas sa clé : le navigateur la lit comme avant, et l'état
  d'erreur reste le sien.

## Delta à produire

- [ ] Constructeurs de requête partagés (files, métriques, audit), lus par le navigateur et par
  le serveur.
- [ ] Lecture serveur des six requêtes par la page, amorcées dans TanStack (patron
  `AmorceCapacites`, TCK-1278).
- [ ] Test vitest : la page rend comptes, métriques et activité sans aucun appel du navigateur à
  `/api/super-admin/*` ; une lecture serveur en échec laisse sa clé au navigateur.

## Critères d'acceptation

- [ ] AC1 — au premier rendu de la page, les quatre comptes, les tuiles et les entrées d'audit
  sont affichés, et aucun `fetch('/api/super-admin/…')` n'est parti.
- [ ] AC2 — une lecture serveur en échec : cette seule clé est lue par le navigateur.

## Hors périmètre

- Les lectures des autres écrans de la console, et celles de la barre latérale hors de l'accueil.

## Notes d'implémentation

_(à remplir par implementing-specs)_
