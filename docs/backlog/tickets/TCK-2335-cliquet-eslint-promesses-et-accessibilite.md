---
id: TCK-2335
title: "Les promesses mal tenues et le jeu jsx-a11y recommandé passent en erreur au lint du front, l'existant gelé par les suppressions natives d'ESLint 10"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-210--gestionnaires-async-du-front-qui-attendent-mutateasync-sans-rattraper-lerreur"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa"
tags: [front, lint, a11y, ci, pistes]
---

## Objectif

Aucun gestionnaire `async` neuf ne part dans un attribut JSX sans que le lint le refuse, aucune
promesse neuve ne flotte, et aucune violation neuve des règles d'accessibilité n'entre dans le
front. Ce qui existe déjà est gelé, compte par fichier et par règle, puis résorbé par lots : le
gel ne se desserre jamais en silence.

## Contexte

Réfs : **P210.05** et **P07.12** du fichier de pistes, toutes deux `validé`.

- `takussan-web/eslint.config.mjs` n'activait ni `@typescript-eslint/no-misused-promises` ni
  `@typescript-eslint/no-floating-promises`, et ne configurait pas le lint typé. Les défauts de
  l'angle 210 et P182.01 sont le motif que la première refuse (`onClick={handleRentReview}` d'une
  fonction `async`) (P210.05).
- `eslint-config-next` ne pose que six règles `jsx-a11y`, en `warn` : ni
  `label-has-associated-control`, ni `click-events-have-key-events`, ni
  `no-static-element-interactions` (P07.12).

## Décision du porteur

- P210.05 :

  > validation du porteur (2026-10-25) : `no-misused-promises` (attributs JSX) et `no-floating-promises` en error, l'existant gelé par les suppressions natives d'ESLint 10 (`eslint-suppressions.json`) puis résorbé par lots ; surcoût mesuré sur le runner de `web-ci` par la PR

- P07.12 :

  > validation du porteur (2026-10-25) : règles `jsx-a11y` en error sous le cliquet natif d'ESLint (suppressions en masse, `eslint-suppressions.json`), sur le même mécanisme que P210.05

## Hypothèses

- **Quelles règles `jsx-a11y`** : le jeu `recommended` du plugin installé (6.10.2), lu dans la
  config de Next qui l'enregistre déjà, plus les options que Next pose (`alt-text` sur `Image`),
  le tout en `error`. C'est le jeu qui contient les trois règles nommées par le constat ; `strict`
  n'est pas demandé. Le plugin n'est pas importé à part : il n'est pas une dépendance du dépôt
  (il vit sous `eslint-config-next`), et deux objets sous le même nom feraient « redéfinir » le
  plugin.
- **`no-misused-promises`** : `checksVoidReturn` limité aux attributs JSX, comme la décision le
  dit ; `checksConditionals` et `checksSpreads` éteints, pour ne viser que ce motif.
  `no-floating-promises` garde ses options par défaut.
- **Le lint typé** : `parserOptions.projectService` sur `**/*.{ts,tsx,mts,cts}`, avec le
  `tsconfig.json` du front.
- **Le gel** est écrit par `--suppress-rule`, règle par règle (les treize règles qui avaient des
  violations), et non par `--suppress-all` : rien d'autre n'y entre.

## Delta à produire

- [x] `eslint.config.mjs` : blocs `takussan/a11y-en-erreur` et `takussan/promesses`, et le mode
      d'emploi du cliquet en commentaire.
- [x] `takussan-web/eslint-suppressions.json` versionné : 166 violations dans 112 fichiers.
- [x] `scripts/check-eslint-suppressions.mjs`, joué par `repo-ci.yml` : aucun compte du gel ne
      dépasse celui de la base (`origin/$GITHUB_BASE_REF` en PR, `HEAD^` en push, sinon
      `origin/pre-dev` puis `origin/dev`), et une entrée neuve rougit.

## Critères d'acceptation

- [x] AC1 (P210.05, P07.12) — `npm run lint` sort en 0 sur l'arbre, en lisant le fichier de
      suppressions sans option (le même appel que `web-ci.yml`, `working-directory: takussan-web`).
- [x] AC2 (P210.05, P07.12) — Une violation neuve rougit : un fichier neuf avec une promesse
      flottante, un `async` passé à `onClick` et un `div` cliquable → exit 1, quatre erreurs.
- [x] AC3 (P210.05) — Une violation de plus dans un fichier gelé rougit (exit 1).
- [x] AC4 (P210.05) — Une violation corrigée sans élaguer rougit (exit 2), jusqu'à
      `--prune-suppressions` : le cliquet ne se desserre pas en silence.
- [x] AC6 (P210.05) — Un regel par `--suppress-all` rougit `check-eslint-suppressions` : une
      promesse flottante dans un fichier neuf, gelée, lint vert → la garde sort en 1 et nomme
      l'entrée neuve.
- [ ] AC5 (P210.05) — Surcoût relevé sur le runner de `web-ci` de la PR.

## Mesures

- Violations gelées (2026-10-25) : 166 dans 112 fichiers, sur 2 458 fichiers lus.
  - `no-misused-promises` 83, `no-floating-promises` 36 ;
  - `jsx-a11y` 47 : `aria-role` 17, `no-autofocus` 11, `anchor-has-content` 4,
    `no-redundant-roles` 3, `no-static-element-interactions` 3, `interactive-supports-focus` 2,
    `media-has-caption` 2, `label-has-associated-control` 2, `click-events-have-key-events` 1,
    `anchor-is-valid` 1, `no-noninteractive-tabindex` 1.
- Temps de `npm run lint` en local (8 cœurs, charge 3,0 à 4,1 sur 1 min, 3,8 à 4,1 sur 5 et
  15 min) : **26,0 s avant** (`user` 42,2 s) ; **48,5 s** avec les règles (`user` 72,8 s), et
  **51,5 s** avec le fichier de suppressions (`user` 74,1 s), soit environ +23 à +25 s. Le
  surcoût sur le runner reste à relever (AC5).

## Reste à faire

- Résorber par lots les 166 violations gelées, chaque lot suivi de
  `npx eslint --prune-suppressions` (décision de P210.05 : « puis résorbé par lots »).

## Hors périmètre

- Une garde qui empêche de déplacer une violation d'un fichier gelé à un autre à compte égal :
  `check-eslint-suppressions` compare des comptes, par fichier et par règle.

## Notes d'implémentation

- Ablation (le cliquet est la garde, il n'y a pas de test vitest) :
  - fichier neuf `src/components/AblationCliquet.tsx` (promesse flottante, `onClick={async}`,
    `div` cliquable) → `npx eslint` exit 1, quatre erreurs (`no-floating-promises`,
    `click-events-have-key-events`, `no-static-element-interactions`, `no-misused-promises`) ;
    fichier retiré ;
  - `forgot-password/page.tsx`, gelé à une violation : un second `onReset={handleSubmit}` → exit 1 ;
    la violation corrigée (`onSubmit={(e) => void handleSubmit(e)}`) → exit 2 sur le fichier et
    sur `npm run lint` ; fichier remis → exit 0.
- `check-eslint-suppressions` en push compare à `HEAD^` et non à `origin/pre-dev` : comparer
  `dev` à `pre-dev` rougirait `dev` à chaque lot résorbé sur `pre-dev` et pas encore promu.
  Ablation : une hausse, une règle neuve et un fichier neuf ajoutés au JSON → 3 hausses, exit 1 ;
  un regel réel par `--suppress-all` → exit 1 ; une baisse → exit 0, imprimée ; base sans le
  fichier → exit 0, dit ; ref absente → exit 1.
- Le fichier de suppressions se lit depuis le répertoire courant : `npx eslint` se lance depuis
  `takussan-web/`, comme `npm run lint` et `web-ci.yml`. Lancé depuis la racine du dépôt, il ne le
  trouverait pas et rougirait sur tout l'existant.
- `void f()` satisfait les deux règles sans `catch` (P210.04) : elles ne remplacent pas la
  relecture du chemin d'erreur.
