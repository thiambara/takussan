---
id: TCK-473
title: "Les trois gardes de `gen-features-by-actor.mjs` ne sont prouvées par rien"
status: review
phase: P2
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-30
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

- [x] Porter les trois sondes de l'en-tête en **corpus d'épreuve automatisé**, sur le patron des
      `scripts/check-*.mjs` qui portent déjà le leur.
- [x] Le corpus doit vivre en mémoire ou dans un répertoire jetable — **jamais** en modifiant
      `docs/features.md`, qu'une exécution interrompue laisserait cassé.

## Critères d'acceptation

- [x] **AC1** — chacune des trois gardes a au moins un cas d'épreuve qui la fait tirer, et un
      témoin légitime qui **passe** ; les deux sont comptés, pas seulement asserted.
- [x] **AC2** — ⚠ **l'ablation se fait dans l'ordre qui trouve les trous** : court-circuiter le
      corpus d'abord, PUIS démonter la branche de garde. Les deux ensemble doivent rougir. Un
      corpus vide qui laisse `exit 0` est le défaut que cet AC existe pour attraper, et il n'est
      visible qu'en démontant les deux.
- [x] **AC3** — la borne déclarée décrit la borne appliquée : si le corpus compte N cas, le
      message le dit et un cas retiré fait rougir le compte.
- [x] **AC4** — `--check` reste **rapide** : la CI le rejoue à chaque PR. Chiffrer le coût ajouté.

## Hors périmètre

- La justesse du contenu de `docs/features-by-actor.md` : les gardes vérifient la forme, pas le
  fond, et c'est assumé.

## Notes d'implémentation

Relevé par l'agent qui a implémenté TCK-447, dans son propre rapport, et repris par la session à la
clôture du lot des vagues 50-51.

---

## Ce que la re-mesure a rendu (2026-08-30, avant d'implémenter)

**Le ticket dit « trois gardes ». Il y en a HUIT.** Aux trois défauts de source (`undeclared`,
`unusedDeclared`, `orphans`) s'ajoutent les deux verdicts de fraîcheur de `--check`
(`sortie-absente`, `sortie-perimee`) et les trois invariants fatals de l'analyse
(`legende-absente`, `legende-vide`, `aucune-ligne`) — soit six `process.exit(1)`/`throw` que
`grep -n -e 'process.exit(1)' -e 'throw new Error' docs/gen-features-by-actor.mjs` rendait déjà.

**Les trois sondes de l'en-tête y sont bien, mot pour mot** — et elles ne prouvaient pas ce
qu'elles annonçaient. Rejouées à la lettre sur une COPIE du dépôt (jamais sur `docs/features.md`),
les trois sortent bien en 1 sous `--check`, mais **toutes les trois par le même message** :

```
✗ features-by-actor.md ne suit plus features.md.
```

`--check` compare la fraîcheur AVANT d'appeler `failOnSourceDefects()`, et toute mutation de la
source périme la vue. Les trois sondes prouvaient donc la garde de FRAÎCHEUR, trois fois, et rien
des trois gardes qu'elles prétendaient éprouver — **dans le seul mode que la CI exécute**. Elles
tirent par le bon chemin en mode ÉCRITURE, lui qui régénère d'abord ; c'est vraisemblablement là
qu'elles avaient été mises au point.

C'est plus grave que ce que le ticket supposait : ce n'est pas « rien ne prouve que les trois
gardes tirent », c'est *« la preuve qu'on croyait avoir désignait une autre garde »*. D'où les
**genres** portés par chaque refus, et l'égalité STRICTE entre genres attendus et genres obtenus
dans le corpus : « ça a échoué » n'y est jamais un succès.

## Ce qui a été livré

Corpus **en mémoire, inline dans `docs/gen-features-by-actor.mjs`** (patron de
`scripts/check-enum-namespaces.mjs` et `scripts/check-auth-interrupts.mjs`), joué à chaque
invocation avant toute lecture du dépôt. Aucun fichier n'est écrit par le corpus : une exécution
interrompue ne laisse rien de cassé. **20 cas** — 8 rouges, 6 témoins verts, 3 invariants fatals,
3 cas de fraîcheur — couvrant les 8 genres. Les décisions ont été extraites en fonctions pures
(`verdictsDeSource`, `verdictFraicheur`) pour que le corpus emprunte **exactement** le chemin de
production.

`repo-ci.yml` rejoue déjà `node docs/gen-features-by-actor.mjs --check` : **aucun câblage CI
supplémentaire n'est nécessaire**, le corpus tourne dans le step existant.

## Ablation (l'ordre imposé par AC2), chaque modification prouvée par `md5`, restaurée par `cp`

| geste(s) | résultat |
|---|---|
| corpus court-circuité seul (4 boucles → `for (const cas of [])`) | **EXIT 1** |
| corpus court-circuité **PUIS** branche `undeclared` démontée | **EXIT 1** |
| + contrôle des genres neutralisé, **PUIS** branche démontée | **EXIT 1** (bornes, contrôle hors fonction) |
| + contrôle des BORNES qui vit dehors, retiré | EXIT 0 — **3 gestes distincts** |

Même au troisième geste la ligne de succès imprime « corpus : 0 cas rouges, 0 témoins … » : la
taille du corpus reste lisible dans le journal de CI.

Onze autres ablations, toutes rouges avec le bon message : chaque branche de garde démontée une à
une (les 3 de source, les 2 de fraîcheur, 1 invariant), un faux positif fabriqué (attrapé par les
témoins seuls), un cas retiré du corpus (`7/8 cas rouges` — AC3).

## AC4 — coût

Mesuré AVANT/APRÈS **entrelacés dans la même fenêtre** (2 × 15 exécutions alternées), la machine
portant huit agents : `uptime` 3,22 → 3,52 sur 8 cœurs. Médiane **59,0 ms → 69,9 ms**, soit
**+10,9 ms (+18,6 %)**. L'essentiel des 59 ms est le démarrage de Node ; le corpus est la dizaine
de millisecondes ajoutée, pour 20 cas. Un temps absolu ne serait pas lisible sous cette charge, le
delta l'est.
