---
id: TCK-2422
title: "Radar : l'article des conditions et la mention publique du mandat Takussan, à l'acceptation d'ADR-0079"
status: todo
phase: P3
family: full
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2394]
blocks: []
spec_refs:
  features:
    - "docs/features.md#210-pages-légales-publiques"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, mandat, juridique, adr-0079]
---

## Objectif utilisateur

Un visiteur sait qu'une annonce diffusée par Takussan l'est pour le compte de son annonceur, et
les conditions d'utilisation disent ce que Takussan fait alors.

## Contexte

[ADR-0079](../../adr/0079-la-publication-sous-mandat-takussan.md) est **Proposé** : la publication
sous mandat existe derrière le drapeau `radar_mandate`, éteint (TCK-2394). L'article 1 des CGU dit
« sauf mention expresse contraire, nous ne sommes ni […] mandataire immobilier des biens
présentés » : la mention expresse est ce ticket. La règle du dossier juridique
(`takussan-web/src/content/legal/README.md`) veut qu'un texte n'entre qu'avec le code qui le
tient : ce ticket se fait **dans la PR qui accepte l'ADR**, avant d'allumer le drapeau.

## Delta à produire

- [ ] Article des CGU (rédaction de départ dans ADR-0079 § Les textes), `VERSION_DOCUMENTS`
      avance, traduction anglaise de courtoisie ; relecture d'un avocat.
- [ ] La fiche publique d'un bien publié sous mandat porte la mention « diffusée par Takussan pour
      le compte de son annonceur » (fr, en ; wo en pause).
- [ ] ADR-0079 passe « Accepté ».

## Critères d'acceptation

- [ ] AC1 — La fiche publique d'un bien sous mandat porte la mention ; celle d'un autre bien non.
- [ ] AC2 — Le texte des CGU nomme la diffusion pour le compte d'un annonceur, et sa version avance.

## Hors périmètre

- La reprise des biens par l'annonceur qui ouvre un compte (TCK-2421).

## Notes d'implémentation

_(à remplir par implementing-specs)_
