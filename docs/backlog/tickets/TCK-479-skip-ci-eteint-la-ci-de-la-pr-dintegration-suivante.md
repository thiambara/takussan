---
id: TCK-479
title: "Le `[skip ci]` de la carte d'impact éteint la CI de la PR d'intégration suivante — 7 fois sur 12"
status: todo
phase: P1
family: full
estimate: M
wave: 52
created: 2026-08-30
updated: 2026-08-30
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [ci, deploiement, garde, dette, preview]
---

## Objectif utilisateur

Aucun directement. Ce qui est en jeu est la garde : une PR qui déploie doit être **vue** par la CI
du dépôt, ou dire clairement qu'elle ne l'a pas été.

## Le défaut, mesuré le 2026-08-30

`api-ci.yml` régénère `takussan-api/tests/impact-map.json` après chaque push sur `dev` et la
commite en `[skip ci]`. Ce marqueur est **nécessaire** et son commentaire le justifie bien : sans
lui, le push relance API CI, qui régénère, qui repousse — une boucle qui ne s'arrête pas seule.

Le raisonnement s'arrête au **push**. Il manque la suite : ce commit devient la **tête de `dev`**,
donc le `head` de la prochaine PR d'intégration `dev` → `preview`. GitHub applique `[skip ci]` au
**commit**, pour *tous* les événements qui le visent — `push` **et** `pull_request`. La PR
d'intégration, ouverte des heures ou des jours plus tard et sans aucun rapport avec la carte,
n'exécute donc **aucun** workflow du dépôt.

**Ce n'est pas un cas limite — c'est la majorité.** Sur les 12 dernières PR fusionnées vers
`preview` :

| PR | tête de `dev` au moment de la PR | contrôles GitHub Actions |
|---|---|---|
| #239 | `chore(tests): régénérer la carte d'impact [skip ci]` | **aucun** |
| #236 | idem | **aucun** |
| #234 | idem | **aucun** |
| #229 | idem | (idem) |
| #227 | `Merge pull request #226…` | **5** — Gardes documentaires, mapping, variables du build, Web, Vercel |
| #224 | `[skip ci]` | (idem) |
| #221 | `[skip ci]` | (idem) |
| #219 | `Merge pull request #218…` | — |
| #216 | `[skip ci]` | (idem) |
| #208, #152, #149 | commits ordinaires | — |

**7 sur 12.** Vérifié par exécution sur trois d'entre elles :

```
$ gh pr view 236 --json statusCheckRollup -q '[.statusCheckRollup[]|.name]|unique|join(", ")'
Vercel
$ gh pr view 234 …
Vercel
$ gh pr view 227 …      ← tête SANS [skip ci]
Gardes documentaires, Le mapping branche → environnement tient encore,
Variables du build front déclarées dans le dépôt, Vercel, Web (…)
```

## Pourquoi ça coûte

**Une PR sans contrôle ne ressemble pas à une PR sans contrôle.** #239 affichait
`mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, et **un** vert — celui de Vercel, qui n'est pas
GitHub Actions et ignore `[skip ci]`. Rien, nulle part, ne dit que les gardes n'ont pas tourné.
*Un vert unique sur une PR d'intégration ressemble exactement à une CI qui a tourné.*

Et cette PR-là **déploie** : `deploy-preview.yml` se déclenche sur `push` vers `preview` avec
`paths: takussan-api/**`, et sert `https://preview.api.takussan.com` — 5 exécutions réussies,
~1 min 20 chacune. Le seul environnement déployé de ce dépôt est donc alimenté par des PR que la
CI du dépôt n'a, sept fois sur douze, pas regardées.

⚠ **Le risque réel est resté faible jusqu'ici, et il faut le dire** : le commit parent de la tête
`[skip ci]` est un merge de PR, lui, contrôlé ; et le seul écart entre les deux est
`tests/impact-map.json`, un artefact dérivé qu'aucun code n'importe. **Ce qui est cassé n'est pas
le code livré, c'est la garde** — et une garde qui ne s'exerce pas ne prévient pas le jour où
l'écart cesse d'être bénin.

## Le marqueur se lit dans TOUT le message, corps compris — mesuré sur ce ticket même

Le premier commit de ce ticket n'a déclenché **aucun** workflow sur sa PR. Sa tête n'était pas
celle du bot : c'était le commit qui **décrit** le défaut, et qui citait `[skip ci]` trois fois
dans son corps pour l'expliquer.

```
$ git log -1 --format='%B' | grep -n 'skip ci'
7:Cause : `api-ci.yml` commite la carte d'impact en `[skip ci]` après chaque push
12:`head` de la prochaine PR d'intégration, et GitHub applique `[skip ci]` au
17:une tête `[skip ci]`. Vérifié par exécution, pas déduit du YAML :
$ gh run list --branch fix/tck-479-… → aucun run
```

GitHub ne lit pas seulement la **première ligne**, et ne distingue pas une **mention** d'une
**directive** : le marqueur est cherché dans le message entier, y compris à l'intérieur de
guillemets inverses. *Le commit qui documentait le mécanisme l'a déclenché sur lui-même.*

Deux conséquences pour ce ticket :

- **Le remède ne peut pas se contenter de filtrer le commit du bot par son auteur ou son titre.**
  N'importe quel message citant le marqueur produit le même effet, et une PR qui parle de CI en
  citera.
- **AC1 doit être éprouvé sur une PR réelle** (c'est déjà ce qu'il dit) : ici, la lecture du YAML
  aurait conclu que `docs/**` déclenche `repo-ci`, et elle aurait eu raison sur le YAML et tort
  sur le fait.

## Contraintes strictes (métier)

- ⚠ **Ne pas retirer `[skip ci]`.** Il empêche une boucle de régénération qui ne s'arrête pas
  seule, et son commentaire dans `api-ci.yml:404-407` le documente. Le remède doit garder cette
  propriété.
- ⚠ **`dev` n'est pas protégée** (relevé du fichier, 2026-08-17 :
  `gh api repos/thiambara/takussan/branches/dev/protection` → 404). Le step pousse en direct. Un
  remède qui suppose une protection de branche change autre chose que ce ticket.
- ⚠ **Le commentaire d'`api-ci.yml:453-461` a déjà identifié une conséquence du `[skip ci]`** —
  que `check-impact-map.mjs` de `repo-ci.yml` ne s'exerce jamais sur la carte — et l'a compensée
  en validant la carte **là où elle est produite**. La compensation couvre le **fichier**, pas la
  **tête de branche**. *Une atténuation juste peut laisser entier le second effet du même
  mécanisme ;* reprendre ce commentaire plutôt que le contredire.
- Le remède ne doit pas rendre la carte « aimant à conflits » : elle n'a qu'un écrivain, sur `dev`,
  et c'est délibéré.

## Pistes (à trancher dans le ticket, pas ici)

Trois directions, aucune évidente — c'est pourquoi ce ticket existe plutôt qu'un correctif :

1. **Déplacer la carte hors de l'historique de `dev`** — artefact de build (cache Actions,
   *release asset*) plutôt que fichier commité. Supprime la cause à la racine ; demande de revoir
   d'où `bin/impacted-tests.php` la lit.
2. **Réarmer à l'ouverture d'une PR** — un workflow `on: pull_request` qui, voyant une tête
   `[skip ci]`, relance explicitement les trois autres (`workflow_dispatch`, ou un job qui les
   appelle). Le plus petit changement ; ajoute une pièce mobile.
3. **Ne plus pousser sur la tête** — commiter la carte sur une branche dédiée, ou l'amender au
   merge. Évite la tête `[skip ci]` sans toucher aux workflows.

## Delta à produire

- [ ] Trancher entre les trois pistes, et **écrire pourquoi** — celle qu'on ne documente pas
      coûtera au prochain lecteur
- [ ] Appliquer, en conservant la propriété anti-boucle
- [ ] Rendre l'absence de contrôles **visible** dans tous les cas, même après correctif : une PR
      d'intégration sans run Actions doit le dire, pas se présenter `CLEAN`

## Critères d'acceptation

- [ ] AC1 — une PR `dev` → `preview` ouverte alors que la tête de `dev` porte `[skip ci]`
      exécute les workflows du dépôt. **Éprouvé sur une PR réelle**, pas sur une lecture de YAML :
      `gh pr view <n> --json statusCheckRollup` doit rendre plus que `Vercel`.
- [ ] AC2 — **témoin** : une PR dont la tête ne porte pas `[skip ci]` continue d'exécuter
      exactement ce qu'elle exécutait. Une garde qui déclenche tout, tout le temps, n'a rien
      réparé — elle a supprimé les `paths:`.
- [ ] AC3 — la boucle de régénération ne revient pas : après un push sur `dev`, `api-ci.yml` ne
      se relance pas en chaîne. Vérifié sur `gh run list`, pas déduit du YAML.
- [ ] AC4 — `php bin/impacted-tests.php --run` trouve toujours sa carte et rend le même
      résultat qu'avant sur un diff témoin.
- [ ] AC5 — le commentaire d'`api-ci.yml` est mis à jour : il porte aujourd'hui la moitié du
      raisonnement (le fichier), il doit porter l'autre (la tête de branche) ou dire que le
      mécanisme a disparu.

## Hors périmètre

- Protéger `dev`. C'est une décision de politique de branche, pas un correctif de CI, et le
  fichier dit déjà ce qu'elle impliquerait pour ce step.
- Les autres environnements. `master` n'est pas concernée : `deploy.yml` se déclenche sur `push`,
  pas sur PR.

## Notes d'implémentation

Relevé en ouvrant la PR #239 (`dev` → `preview`, 77 commits) et en constatant qu'elle n'affichait
qu'un seul contrôle. *Le défaut n'a pas été trouvé en lisant les workflows — il a été trouvé en
regardant ce qu'une PR affichait réellement, ce qu'aucune lecture de YAML n'aurait rendu.*
