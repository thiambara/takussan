---
id: TCK-483
title: "Le garde `if (!completing)` de `WizardReprenable` est du code mort : la fermeture fige `completing` à `false`"
status: todo
phase: P2
family: front
estimate: S
wave: 53
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-475]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, wizard, dette]
---

## Objectif utilisateur

À la fin d'un assistant, le brouillon est supprimé volontairement. Annoncer « Progression
sauvegardée » à ce moment-là est faux, et c'est précisément ce qu'un garde existant devait
empêcher.

## Le défaut

`takussan-web/src/components/wizard/WizardReprenable.tsx:154` — le garde `if (!completing)` du
toast de succès **n'a jamais rien gardé**. L'effet qui l'entoure déclare `[hydrated]` pour seule
dépendance (l. 160) : sa fermeture de nettoyage capture `completing` **tel qu'il valait à
l'hydratation**, c'est-à-dire `false`, définitivement.

Coût : le toast « Progression sauvegardée » part **aussi** sur le chemin de finalisation, là où le
brouillon vient d'être supprimé par `clear()`. Le garde existe pour l'empêcher et ne l'a jamais
fait.

⚠ **Ce défaut n'est pas aggravé par TCK-475** — il préexistait, et le correctif de TCK-475 ne le
traverse pas. Il est relevé ici parce qu'un garde mort dans un fichier qu'on vient de corriger est
exactement ce qu'on ne rouvrira plus jamais.

*Une valeur figée par une fermeture ne se voit pas à la lecture : le garde est écrit, il est juste,
et il porte sur une variable qui ne bouge plus.*

## Contrat de données

Aucun.

## Delta à produire

- [ ] Rendre la valeur lisible au moment du nettoyage — une `ref` plutôt qu'une variable capturée,
      ou une dépendance juste — et **écrire laquelle**, parce que les deux ont des conséquences
      différentes sur le nombre d'exécutions de l'effet.
- [ ] Vérifier que corriger la dépendance ne fait pas repartir l'effet à chaque changement d'état :
      c'est probablement pour ça que `[hydrated]` avait été écrit.

## Critères d'acceptation

- [ ] **AC1** — sur le chemin de finalisation, le toast « Progression sauvegardée » **ne part
      pas** ; sur le chemin de démontage ordinaire, il part toujours.
- [ ] **AC2** — un test **compte** les exécutions de l'effet avant et après : une correction par la
      liste de dépendances qui multiplierait les écritures serait un remède pire que le mal.
- [ ] **AC3** — ablation : rétablir la capture figée fait rougir AC1, changement prouvé par `md5`
      **avant** lecture du résultat.

## Hors périmètre

- Les deux sites de toast corrigés par TCK-475.
- La stratégie de reprise du brouillon elle-même.

## Notes d'implémentation

Relevé par l'agent de TCK-475 en marge de son ticket, et signalé plutôt que corrigé — la
correction touche l'ordonnancement d'un effet, ce qui n'est pas un delta de toast.
