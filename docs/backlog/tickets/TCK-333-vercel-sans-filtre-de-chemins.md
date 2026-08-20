---
id: TCK-333
title: "L'intégration Vercel n'a aucun filtre de chemins : chaque commit reconstruit le front"
status: todo
phase: P3
family: technique
estimate: S
wave: 38
created: 2026-08-20
updated: 2026-08-20
depends_on: [TCK-299]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, front, vercel, ci, gaspillage]
---

## Objectif utilisateur

Qu'un commit qui ne touche ni le front ni ce dont il dépend ne déclenche pas la reconstruction et le
redéploiement du front — pour que l'état des checks d'une PR de documentation ou d'API dise quelque
chose de cette PR.

## Contrat de données

Aucune donnée applicative. Le mapping et les domaines vivent dans
[`docs/infra/frontend-deploiement.json`](../../infra/frontend-deploiement.json) et ne sont pas
recopiés ici ; ce ticket ne porte que la mesure du **volume** et le delta.

### 1. Le cas isolé — un commit de documentation pure a déployé le front

```
$ git show --stat --format='%h %ad %s' --date=iso 6f38de67
6f38de67 2026-08-17 23:41:12 +0000 docs(backlog): TCK-320 AC7 repasse NON TENU …
 .../TCK-320-selection-des-tests-par-impact.md | 51 ++++++++++++++++++++--
 1 file changed, 47 insertions(+), 4 deletions(-)

$ gh api repos/thiambara/takussan/deployments/6001431629 \
    -q '[.id,.environment,.ref,.created_at]|@tsv'
6001431629  Preview  6f38de675a35b597b42a2f92add111ba1656cc68  2026-08-20T11:38:16Z
```

Un fichier markdown sous `docs/backlog/`, aucun octet de `takussan-web/` — et un build Next complet
suivi d'un déploiement Preview.

### 2. Le volume — ce n'est pas une anomalie, c'est le régime courant

Pour chacun des 212 déploiements « Preview », le commit déployé est comparé à **son premier parent**
(le test tient donc aussi pour les commits de merge, contrairement à `git diff-tree -r` seul, qui
n'imprime rien sur un merge et gonflerait le compte) :

```
déploiements Preview total          : 212
  sha présent dans le clone local   : 208   (4 absents : branches supprimées)
  le commit touche takussan-web/    :  95
  le commit NE touche PAS takussan-web/ : 113
```

**113 déploiements sur 208 mesurables — 54 % — reconstruisent le front pour un diff qui ne le
touche pas.** Cause : le projet Vercel n'a aucun filtre de chemins, et le dépôt ne porte aucun
fichier qui pourrait en poser un.

```
$ ls takussan-web/vercel.json vercel.json
ls: takussan-web/vercel.json: No such file or directory
ls: vercel.json: No such file or directory
```

Le relevé le déclare déjà dans son champ `filtre_de_chemins` (`"presence": false`) — ce ticket est
le delta qui le referme, pas une seconde copie du constat.

### 3. Pourquoi ce `vercel.json` ne contredit pas ADR-0017

[ADR-0017](../../adr/0017-deploiement-du-front-pilote-par-vercel.md) écarte un `vercel.json` posé
« pour versionner le réglage Vercel » — ce serait la seconde source de vérité que l'ADR existe pour
éviter — et **nomme explicitement cette exception** : un `ignoreCommand` répond à un besoin
*distinct*, mesuré, et son fichier vit dans `takussan-web/`, hors du périmètre de TCK-299. Le
fichier livré ici ne doit donc décrire **que** le filtre, jamais les domaines, les branches ni les
variables.

## Contraintes strictes (métier)

- **Le fichier ne duplique aucune valeur du relevé** : ni domaine, ni branche, ni variable
  d'environnement. Un `ignoreCommand` et rien d'autre.
- **Le filtre doit laisser passer ce dont le front dépend réellement**, et pas seulement
  `takussan-web/` : la racine du monorepo porte des fichiers qui entrent dans le build. Le périmètre
  se **mesure** avant d'être écrit, il ne se devine pas.
- **Un `ignoreCommand` qui se trompe supprime un déploiement attendu**, et le symptôme est une
  absence — donc silencieux. Le correctif doit être prouvé dans les deux sens : un commit front
  déploie, un commit hors front ne déploie pas.
- L'effet ne se constate que **côté Vercel** : le dépôt peut prouver la logique du script en local,
  pas son déclenchement. Cette limite se déclare, comme celle de la garde d'ADR-0017 (conséquence
  n°5), au lieu d'être passée sous silence.

## Delta à produire

- [ ] Mesurer les chemins dont le build front dépend hors de `takussan-web/` (fichiers de racine
      lus par le build) et écrire cette liste dans le ticket avant d'écrire le filtre.
- [ ] `takussan-web/vercel.json` avec un `ignoreCommand` — ou le mécanisme équivalent retenu — qui
      annule le build quand le diff ne touche aucun de ces chemins.
- [ ] Vérifier que le Root Directory du projet Vercel rend ce fichier effectif ; ce réglage est
      listé comme **non mesuré** dans le relevé. S'il ne l'est pas, le dire et s'arrêter là plutôt
      que de livrer un fichier inerte.
- [ ] Mettre à jour le champ `filtre_de_chemins` de `docs/infra/frontend-deploiement.json` une fois
      l'effet **observé**, pas une fois le fichier écrit.

## Critères d'acceptation

- [ ] AC1 — un commit ne touchant que `docs/` ou `takussan-api/`, poussé sur une branche de PR, ne
      produit **aucun** déploiement Vercel. Vérifié par
      `gh api repos/thiambara/takussan/deployments` après le push — donc par le **résultat**, pas
      par la lecture du `vercel.json`.
- [ ] AC2 — un commit touchant `takussan-web/` produit toujours son déploiement Preview. Même
      vérification, même commande. **AC1 sans AC2 est une régression, pas un correctif.**
- [ ] AC3 — la logique du filtre est prouvée par ablation locale : sortie « build annulé » sur un
      diff hors front, sortie « build lancé » sur un diff front, les deux collées.
- [ ] AC4 — le champ `filtre_de_chemins` du relevé décrit l'état observé après coup, avec sa date.
- [ ] AC5 — le `vercel.json` livré ne contient aucune valeur déjà portée par le relevé
      (domaines, branches, variables) — vérifiable en le lisant en entier.

## Hors périmètre

- Le mapping branche → environnement, les domaines et les variables de build — TCK-299 / ADR-0017.
- Le déploiement du front par un workflow du dépôt : écarté par ADR-0017, ce ticket ne le rouvre
  pas.
- L'exposition du site public et l'API absente — TCK-332.
- Les temps de build et le CDN images — TCK-105.

## Notes d'implémentation

_(à remplir par implementing-specs)_
