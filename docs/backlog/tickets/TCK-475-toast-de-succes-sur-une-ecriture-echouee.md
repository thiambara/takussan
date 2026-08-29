---
id: TCK-475
title: "Le brouillon d'assistant annonce « Progression sauvegardée » quand l'écriture a échoué"
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
  features:
    - docs/features.md
tags: [front, wizard, dette]
---

## Objectif utilisateur

Quelqu'un qui remplit un assistant long doit pouvoir croire ce que l'interface lui dit de son
brouillon. Aujourd'hui elle lui dit « sauvegardé » même quand rien ne l'a été — et c'est la
personne qui ferme son onglet en confiance qui paie.

## Le défaut

`takussan-web/src/components/wizard/WizardReprenable.tsx`, l. **134** et **169** : le toast
« Progression sauvegardée » part **sans regarder le résultat de l'écriture**. Un `localStorage`
plein, un navigateur en navigation privée qui refuse le stockage, une requête réseau perdue — le
message est le même.

*Un message de succès qui ne consulte pas le résultat n'est pas un message, c'est une décoration.*

## Contrat de données

Aucun.

## Delta à produire

- [ ] Le toast lit le résultat de l'écriture. En cas d'échec : un message qui **dit quoi faire**,
      pas seulement que ça a raté.
- [ ] Vérifier les deux sites — ils ne sont pas forcément le même chemin.

## Critères d'acceptation

- [ ] **AC1** — écriture en échec (stockage refusé, quota, ou erreur réseau selon le chemin) → le
      toast de succès **ne part pas**, et un message d'échec part.
- [ ] **AC2** — écriture réussie → le toast de succès part toujours. *Un correctif qui éteindrait
      les deux passerait un test qui ne regarde que le cas d'échec.*
- [ ] **AC3** — les DEUX sites (l. 134 et l. 169) sont couverts, et le test dit lequel il éprouve.
- [ ] **AC4** — ablation : rendre l'écriture toujours-réussie du point de vue de l'appelant fait
      rougir AC1.

## Hors périmètre

- La stratégie de reprise du brouillon elle-même.

## Notes d'implémentation

Relevé pendant le lot des vagues 50-51.
