---
id: TCK-323
title: "TypeScript 7 n'exporte plus l'API compilateur côté Node — le cliquet i18n en dépend, et le bump PR #182 le casse"
status: todo
phase: P2
family: technique
estimate: M
wave: null
created: 2026-08-17
updated: 2026-08-17
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models: []
tags: [front, ci, i18n, dette, dependances]
---

## Objectif utilisateur

Qu'une garde du dépôt survive à la mise à jour d'un outil qui n'a rien à voir avec elle. Le
cliquet sur le texte en dur — celui qui défend « le front possède le texte affiché » — cesse de
fonctionner dès que TypeScript passe en 7.x, et rien dans le diff du bump ne le laissait voir.

## Contrat de données

Aucune donnée applicative. La garde lit des fichiers `.tsx` et écrit une baseline de comptes.

## La mesure

Relevée le 2026-08-16 sur la branche de PR #182 (`typescript` 5.9.3 → 7.0.2), reproductible sur
la branche locale `wip/pr182-typescript-7`.

**D'abord une précision qui change le cadrage : `typescript@7.0.2` n'est pas une préversion.**
Il est en `dist-tag: latest` au registre. Ce n'est donc pas un bump prématuré qu'on écarte d'un
revers de main — c'est la version courante de l'outil.

**1. TS 7 (le portage Go) n'exporte plus que deux symboles côté Node.**

```
$ node -e "import('typescript').then(m => { const ts = m.default ?? m;
    console.log(ts.version, typeof ts.ScriptTarget, typeof ts.createSourceFile) })"
7.0.2 undefined undefined
```

`createSourceFile`, `ScriptTarget`, `ScriptKind` : disparus. Symptôme observé :
`TypeError: Cannot read properties of undefined (reading 'Latest')`, et **18 tests rouges** dans
`src/i18n/__tests__/i18n-scan.test.ts`.

**2. Un seul fichier du dépôt en dépend — mais il en dépend profondément.** Vérifié le
2026-08-17 : `takussan-web/scripts/i18n-scan.mjs:13` est le **seul** `import … from 'typescript'`
de tout `scripts/` et `src/`. Ce n'est pas pour autant une surface d'un point : il emploie
**25 points d'entrée distincts** de l'API (`createSourceFile`, `ScriptTarget`, `ScriptKind`,
`SyntaxKind`, `forEachChild`, et 20 prédicats `isXxx`). Le découplage est une réécriture du
tokeniseur, pas une substitution d'appel.

**3. Ce n'est pas le code applicatif qui casse, c'est une garde de CI.** La chaîne est
`web-ci.yml:63` → `npm run check:i18n` → `scripts/check-i18n.mjs:59` → `compteFichier()` →
`ts.createSourceFile()`.

**4. Et les deux commandes qui devraient l'attraper passent.**

| commande | sous TS 7.0.2 |
|---|---|
| `npx tsc --noEmit` | **exit 0** — TS 7 compile ce code sans une erreur |
| `npm run build` | **réussi** — 16,1 s, 89 pages générées |
| `npm run lint` | **meurt au chargement** (cf. ci-dessous) |
| `npm run test` | **18 rouges** sur `i18n-scan` |

**5. Cause distincte et NON actionnable ici : `typescript-eslint` refuse TS 7.0 explicitement.**

```
typescript-eslint does not support TS 7.0.
See also https://github.com/typescript-eslint/typescript-eslint/issues/10940
for tracking typescript-eslint's support for TS >=7.1
```

`@typescript-eslint@8.67.0` (tiré par `eslint-config-next@16.3.1`) déclare
`typescript >=4.8.4 <6.1.0` ; `npm ls` marque TS 7 `invalid` dans tout l'arbre. Le support est
annoncé pour **TS ≥ 7.1**, pas 7.0. Rien de ce dépôt ne peut lever ce point : il s'attend en
amont.

> Les points 1, 4 et 5 sont mesurés par la session du 2026-08-16, dont la note de travail vivait
> dans un répertoire temporaire — c'est la perte imminente de cette note qui motive ce ticket.
> Les points 2 et 3 sont revérifiés à la source le 2026-08-17.

## Contraintes strictes (métier)

- Le cliquet i18n **doit rester une garde**, et non devenir un avertissement : `check:i18n` sort
  en erreur, et `web-ci.yml` continue de bloquer la PR dessus.
- Les quatre catégories comptées (`jsx`, `attribut`, `aria`, `litteral`) et l'énoncé de chacune
  ne changent pas : ce ticket remplace un tokeniseur, pas une définition. La baseline par fichier
  doit rester comparable — un recomptage qui la déplace en masse est le signe que la définition a
  bougé.
- Le total reste un **plancher** : les gabarits interpolés ne sont pas comptés, et ce ticket ne
  cherche pas à les compter.
- Aucune régression sur les 21 cas de `src/i18n/__tests__/i18n-scan.test.ts`.

## Delta à produire

- [ ] Découpler `takussan-web/scripts/i18n-scan.mjs` de l'API compilateur de TypeScript — les
      25 points d'entrée `ts.*` employés sont à couvrir, pas seulement `createSourceFile`.
- [ ] Tests : `src/i18n/__tests__/i18n-scan.test.ts` passe sous TypeScript 5 **et** 7 sans que
      ses attentes changent (c'est le critère qui prouve l'équivalence du tokeniseur).
- [ ] Vérifier `npm run check:i18n` contre la baseline en place : aucun déplacement de compte.
- [ ] Consigner à l'ardoise que le bump TS 7 reste bloqué en amont par `typescript-eslint`
      (point 5), avec le lien de suivi.

## Critères d'acceptation

- [ ] AC1 — `node -e "import('./scripts/i18n-scan.mjs')"` ne touche plus `typescript` :
      `grep -rn "from 'typescript'" takussan-web/scripts takussan-web/src` ne rend rien.
- [ ] AC2 — sous TypeScript 5 (état courant de `dev`), `npm run test` et `npm run check:i18n`
      restent verts, et la baseline i18n est **inchangée fichier par fichier**.
- [ ] AC3 — sous TypeScript 7.0.2 (branche `wip/pr182-typescript-7`), `npm run test` et
      `npm run check:i18n` sont verts eux aussi. Mesuré, pas déduit.
- [ ] AC4 — l'ablation est faite : le nouveau tokeniseur, lancé sur un fichier portant un texte
      en dur ajouté exprès, **rougit**. Une garde qui passe partout ne garde rien.

## Hors périmètre

- **Merger PR #182.** Le bump reste bloqué par `typescript-eslint` (point 5), qui est hors du
  dépôt. Ce ticket rend la garde indépendante de TS ; il ne débloque pas le bump.
- Corriger des textes en dur. La baseline ne bouge pas ici.
- Compter les gabarits interpolés (le plancher reste un plancher).
- Toute autre PR Dependabot. Dependabot est en pause depuis #194 : cette PR n'est ni recréée ni
  rebasée toute seule.

## Notes d'implémentation

_(à remplir par implementing-specs)_
