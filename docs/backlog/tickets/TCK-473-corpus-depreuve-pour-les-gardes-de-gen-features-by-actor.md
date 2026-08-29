---
id: TCK-473
title: "Les trois gardes de `gen-features-by-actor.mjs` ne sont prouvées par rien"
status: todo
phase: P2
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-29
depends_on: [TCK-447]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [outillage, ci, gardes, dette]
---

## Objectif utilisateur

Aucun, directement. C'est une garde de la documentation : elle existe pour qu'un contributeur qui
casse `docs/features-by-actor.md` l'apprenne de la CI et non d'un lecteur.

## Le défaut

TCK-447 a posé **trois gardes** dans `docs/gen-features-by-actor.mjs`, et `repo-ci.yml` rejoue bien
`--check` à chaque PR. Mais **rien ne prouve que les trois gardes tirent encore** : les retirer
laisserait la CI verte, parce que le corpus qu'elles surveillent est le dépôt lui-même, qui est
conforme.

C'est le motif exact qu'une autre garde de ce dépôt a déjà payé :

> *Court-circuiter les boucles du corpus PUIS démonter la branche de garde rend `exit 0`, sans que
> rien ne bronche* — trouvé sur deux gardes distinctes pendant le lot des vagues 50-51, chaque fois
> en démontant **dans cet ordre**, jamais en démontant l'un des deux seul.

Les trois sondes qui prouveraient les gardes **existent**, écrites dans l'en-tête du générateur et
rejouables en trois commandes — mais **à la main**. Une sonde qu'on doit penser à lancer n'est pas
une garde ; c'est une note.

⚠ **Ce n'est pas un manquement de TCK-447** : aucun de ses AC n'exigeait le corpus automatisé, et
l'agent qui l'a implémenté a lui-même relevé la lacune plutôt que de la laisser passer.

## Contrat de données

Aucun.

## Delta à produire

- [ ] Porter les trois sondes de l'en-tête en **corpus d'épreuve automatisé**, sur le patron des
      `scripts/check-*.mjs` qui portent déjà le leur.
- [ ] Le corpus doit vivre en mémoire ou dans un répertoire jetable — **jamais** en modifiant
      `docs/features.md`, qu'une exécution interrompue laisserait cassé.

## Critères d'acceptation

- [ ] **AC1** — chacune des trois gardes a au moins un cas d'épreuve qui la fait tirer, et un
      témoin légitime qui **passe** ; les deux sont comptés, pas seulement asserted.
- [ ] **AC2** — ⚠ **l'ablation se fait dans l'ordre qui trouve les trous** : court-circuiter le
      corpus d'abord, PUIS démonter la branche de garde. Les deux ensemble doivent rougir. Un
      corpus vide qui laisse `exit 0` est le défaut que cet AC existe pour attraper, et il n'est
      visible qu'en démontant les deux.
- [ ] **AC3** — la borne déclarée décrit la borne appliquée : si le corpus compte N cas, le
      message le dit et un cas retiré fait rougir le compte.
- [ ] **AC4** — `--check` reste **rapide** : la CI le rejoue à chaque PR. Chiffrer le coût ajouté.

## Hors périmètre

- La justesse du contenu de `docs/features-by-actor.md` : les gardes vérifient la forme, pas le
  fond, et c'est assumé.

## Notes d'implémentation

Relevé par l'agent qui a implémenté TCK-447, dans son propre rapport, et repris par la session à la
clôture du lot des vagues 50-51.
