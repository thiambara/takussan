---
id: TCK-1489
title: "Garder l'identité des espaces que messagesPour partage entre frontières imbriquées"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-105--charge-rsc-dun-document-app-servi--les-dictionnaires-imbriqués"
tags: [front, i18n, rsc, test, pistes]
---

## Contexte

Réf : **P105.03** du fichier de pistes, `retenu · autonome` (A5).

Les frontières imbriquées de `/app` reçoivent chacune l'ensemble cumulé de leurs espaces, mais le
document servi n'en porte qu'une copie : Flight déduplique les objets **identiques** en références.
Cette déduplication repose sur `messagesPour`, qui recopie la référence de chaque espace depuis
`getMessages()`. Un clonage ou une fusion par frontière ramènerait les copies sans qu'aucun test ne
rougisse : le seul test qui lit `messagesPour` compare par `toEqual`.

## Objectif utilisateur

Le poids des dictionnaires d'un document `/app` ne double pas en silence.

## Contrat de données

Aucun.

## Contraintes strictes (métier)

- Rien de ce qui est servi ne change.

## Delta à produire

- [ ] En-tête de `src/i18n/messages.ts` : la dépendance à l'identité des objets.
- [ ] Test : `messagesPour` sur deux frontières imbriquées, chaque espace commun le **même** objet
      (`toBe`).

## Critères d'acceptation

- [ ] AC1 — un `structuredClone` dans `messagesPour` fait rougir le test.

## Hors périmètre

- Le chemin `wo` (`mergeMessages` de `request.ts`), non mesuré par la piste.
- La charge d'une navigation (P105.02).

## Notes d'implémentation

_(à remplir par implementing-specs)_
