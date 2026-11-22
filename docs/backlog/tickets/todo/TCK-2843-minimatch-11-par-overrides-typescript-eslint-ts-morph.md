---
id: TCK-2843
title: "minimatch 10 → 11 sous typescript-eslint et ts-morph (shadcn) : la dernière alerte « moyenne » du front, que seule une surcharge `overrides` d'une majeure transitive ferme"
status: todo
phase: P3
family: technique
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-16
depends_on: [TCK-2787]
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, dependances, securite, npm, minimatch, front]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai, bloqué par l'amont** — conformément à la décision du porteur du 2026-11-15
(attendre, pas d'`overrides`). `npm audit --package-lock-only` rend toujours 12 avis (2 basses,
10 moyennes), mêmes paquets ; `package.json` n'a pas de bloc `overrides`.

- **Moitié `typescript-eslint` débloquée en canari** : `@typescript-eslint/typescript-estree@8.72.3-alpha.1`
  à `alpha.8` déclarent `minimatch ^11.0.1` ; la stable 8.72.2 reste en `^10.2.2`. La 8.72.3 stable
  devrait fermer les 8 avis de cette chaîne par un simple `npm update typescript-eslint`.
- **Moitié `ts-morph` toujours bloquée** : même `ts-morph@28.0.0` (dernière) → `@ts-morph/common ~0.29.0`
  → `minimatch ^10.0.1`. La chaîne `shadcn` exige une `@ts-morph/common` neuve **et** un `shadcn` qui la tire.

**Condition qui débloque** : `npm view @typescript-eslint/typescript-estree@latest dependencies.minimatch`
et `npm view @ts-morph/common@latest dependencies.minimatch` rendent `^11`. Alors : `npm update`,
`npm ls minimatch` sans 10.x, `npm audit` sans `minimatch`, lint / tsc / shadcn (AC2).

## Décision du porteur (2026-11-15)

Le ticket reste ouvert. On attend que typescript-eslint et ts-morph passent eux-mêmes à minimatch 11 en amont : on
ne force pas la montée par une surcharge `overrides` d'une majeure transitive.

## Objectif utilisateur

`npm audit` du front ne rend plus l'avis `minimatch` (« potential denial of service via globparts
amplification », plage `>=7.0.0 <11.0.1`), sans casser le lint ni la CLI `shadcn`.

## Contrat de données

**Mesure du 2026-11-14 (TCK-2787, après la montée d'`eslint` en 10.15.0)** : `npm audit` du front rend 12 avis
(2 basses, 10 moyennes), dont 10 sont un seul défaut, `minimatch@10.2.6`, tiré par :

- `typescript-eslint@8.72.2` → `@typescript-eslint/typescript-estree` (`minimatch ^10.2.2`) : 8.72.2 est la
  dernière version publiée, aucune ne déclare `^11` ;
- `shadcn@4.23.0` → `ts-morph@26` → `@ts-morph/common@0.27.0` (`minimatch ^10.0.1`) : `shadcn` est une
  dépendance d'**exécution** du `package.json` (4 moyennes sur `npm audit --omit=dev`).

`eslint@10.15.0` tire déjà `minimatch ^11.0.5` : il n'est plus visé. Aucun de ces avis n'est une alerte
Dependabot (relevé du 2026-11-14).

**Les 2 basses restantes** (`deepmerge` via `@shadcn/registry`) n'ont pour correctif proposé que `shadcn@1.0.0`
(régression de trois majeures) : faux correctif, hors de ce ticket.

## Contraintes strictes (métier)

- La seule voie sans attendre l'amont est `overrides` dans `takussan-web/package.json` (`minimatch: ^11.0.1`
  pour ces deux chaînes), qui impose une **majeure** à des paquets qui ne la déclarent pas : c'est la décision
  à prendre *(prise le 2026-11-15 : attente de l'amont, pas de surcharge)*. L'autre voie est d'attendre une version de `typescript-eslint` et de `ts-morph` qui déclare `^11`.
- Vérifier que l'API utilisée (`minimatch()` / `Minimatch`, options) est inchangée entre 10 et 11 avant de
  surcharger.

## Delta à produire

- [x] Décision : surcharge ou attente de l'amont. (décision du porteur du 2026-11-15 : attente de l'amont)
- [ ] Si surcharge : `overrides` posé, `npm ls minimatch` ne rend plus de 10.x. — caduc depuis la décision
      du 2026-11-15 (pas de surcharge).

## Critères d'acceptation

- [ ] AC1 — `npm audit` du front ne rend plus `minimatch`.
- [ ] AC2 — `npm run lint` (0 erreur), `npx tsc --noEmit` et `npx shadcn@<installé> --help` passent ; la CI du
  front est verte.

## Hors périmètre

- `deepmerge` / `shadcn@1.0.0` (correctif proposé par `npm audit` qui est une régression).
- TCK-463 (TypeScript 7).
