---
id: TCK-466
title: "Rien n'empêche de composer à la main le chemin d'un vocabulaire d'enum"
status: todo
phase: P2
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-29
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, i18n, garde, ci]
---

## Objectif utilisateur

Un développeur qui contourne la table des espaces de noms d'enum l'apprend de la CI, pas d'une
relecture qui aurait pu ne pas avoir lieu.

## Contrat de données

`takussan-web/src/components/property-form/options.ts` tient `PROPERTY_ENUM_NAMESPACES` et porte en
commentaire : *« Où vit le libellé de chaque enum. Ne jamais recopier ces chaînes à la main
ailleurs. »* Aucune garde ne le vérifie : `ls scripts/check-*.mjs` n'a rien sur les enums.

## Contraintes strictes (métier)

- **La garde doit LIRE `PROPERTY_ENUM_NAMESPACES` en direct**, jamais recopier ses valeurs — sinon
  elle recrée l'inventaire parallèle qu'elle existe pour empêcher. Ce dépôt a déjà payé ce motif
  ailleurs (journal des corrections, J-07).
- Motif de détection proposé, à éprouver : un *template literal* en premier argument de `t(...)`,
  avec un segment suivi d'un point puis d'une interpolation, quand le traducteur vient d'un
  `useTranslations` dont l'espace de noms n'est **pas** une entrée de la table. Cibler plus
  largement « chaîne interpolée dans `t()` » produirait des faux positifs sur des clés dynamiques
  légitimes.
- ⚠ **Cette garde sera un PLANCHER, pas une preuve**, et son en-tête doit le dire : un
  contournement **sans interpolation** — une clé écrite en dur pour une seule valeur, dans une
  condition — ne matchera aucun motif et restera un travail de revue. Une garde qui se lit comme
  une garantie est pire qu'une garde absente.

## Delta à produire

- [ ] `scripts/check-enum-namespaces.mjs`, avec en-tête portant son motif, sa portée **et sa limite**.
- [ ] Branchement dans `.github/workflows/repo-ci.yml`.
- [ ] Éprouver la garde par ablation : rétablir un contournement connu et vérifier qu'elle rougit
      en nommant le fichier et la ligne.

## Critères d'acceptation

- [ ] AC1 — la garde rougit sur un chemin de clé d'enum composé par interpolation hors de la table.
- [ ] AC2 — elle reste verte sur l'état actuel du dépôt, sans exception inscrite.
- [ ] AC3 — son en-tête énonce explicitement le faux négatif qu'elle ne couvre pas.

## Hors périmètre

- Étendre le motif aux enums d'autres domaines que `property`.

## Notes d'implémentation

TCK-464 a dû faire respecter cette règle **trois fois** à la main, sur trois tâches différentes.
C'est le signal qui motive ce ticket.
