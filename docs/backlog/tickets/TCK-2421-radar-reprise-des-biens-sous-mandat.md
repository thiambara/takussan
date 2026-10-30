---
id: TCK-2421
title: "Radar : l'annonceur publié sous mandat qui ouvre un compte reprend ses biens dans son espace"
status: todo
phase: P3
family: full
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2394]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, mandat, adr-0079]
---

## Objectif utilisateur

Un annonceur dont Takussan diffuse les biens sous mandat change d'avis et veut les gérer lui-même :
il ouvre un compte et retrouve ses biens dans son espace, sans les republier.

## Contexte

[ADR-0079](../../adr/0079-la-publication-sous-mandat-takussan.md) § Conséquences, livré par
TCK-2394. Un bien publié sous mandat vit dans l'espace désigné par `radar.mandate_agency_id` ;
l'annonceur n'a pas de compte (`radar_advertisers.user_id` nul, `mandate_at` posé). TCK-2394
ferme les chemins qui mêleraient les deux états : « publier pour lui » est refusé à un annonceur
sous mandat (`radar.publish.under_mandate`), et la relance d'activation ne le vise pas.

Reste ouvert : la réclamation (TCK-2390) propose encore à cet annonceur ses annonces non publiées,
et crée un compte qui ne voit pas les biens sous mandat.

## Delta à produire

- [ ] Transfert des biens sous mandat (agence, `user_id`, contact) dans l'espace du compte qui
      vérifie le numéro de l'annonceur, dans une transaction, journalisé.
- [ ] La page de réclamation d'un annonceur sous mandat le dit et propose ce transfert.
- [ ] `mandate_at` reste comme trace ; le second message suit le nouvel état.

## Critères d'acceptation

- [ ] AC1 — Après la vérification de son numéro, l'annonceur sous mandat voit ses biens dans son
      espace, sans republication ni perte de vues ou de demandes.
- [ ] AC2 — Rien ne se transfère vers un compte qui n'a pas vérifié le numéro de l'annonceur.

## Hors périmètre

- La présentation publique du mandat (TCK-2422).

## Notes d'implémentation

_(à remplir par implementing-specs)_
