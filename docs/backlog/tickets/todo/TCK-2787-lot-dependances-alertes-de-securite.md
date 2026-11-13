---
id: TCK-2787
title: "Lot dépendances : fermer les alertes de sécurité ouvertes — next en tête (8 critiques), et ce que Dependabot ne voit pas (composer, laravel/framework)"
status: todo
phase: P1
family: technique
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, dependances, securite, dependabot, npm, composer, next, laravel]
---

## Objectif utilisateur

Aucune dépendance connue comme vulnérable ne tourne dans l'image servie, et le décompte des alertes dit la vérité
sur les trois écosystèmes du dépôt.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 33 : « lot dépendances **après fusion** ». Ce lot passe après la
fusion de la PR #1669 (n° 34a : une fois la file vide et la CI verte). Il ne s'ouvre pas avant.

**Mesure du 2026-11-13, en lecture seule, à re-prendre au démarrage** : les chiffres ci-dessous seront périmés à
l'ouverture du ticket.

- Dependabot :
  `gh api -X GET 'repos/thiambara/takussan/dependabot/alerts?state=open&per_page=100' --paginate`.
- npm : `npm audit --json` dans `takussan-web/` et dans `takussan-api/`.
- composer : `composer audit --format=json` dans `takussan-api/`.

**Dependabot : 85 alertes ouvertes**, sur 21 paquets distincts.

| Gravité | Nombre |
|---|---|
| Critique | 8 |
| Haute | 25 |
| Moyenne | 41 |
| Basse | 11 |

- Par manifeste :
  - `takussan-web/package-lock.json` : 67 ;
  - `takussan-web/package.json` : 10 ;
  - `takussan-api/package-lock.json` : 5 ;
  - `package.json` (racine) : 3.
- Par portée : 56 à l'exécution, 29 en développement.
- **Les 8 critiques sont toutes `next`** : 4 avis (GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw, GHSA-p293-qw3h-jr36,
  GHSA-2xp9-vwfh-vxw4), comptés deux fois chacun (manifeste et lock). Le dépôt fige `"next": "16.3.1"` (exact). La
  première version corrigée la plus haute parmi les critiques est **16.4.1**. Les hautes de `next` demandent 16.3.8
  ou 16.4.1.
- Hautes à l'exécution hors `next` (front) : `@modelcontextprotocol/sdk`, `body-parser`, `browserslist`, `fast-uri`,
  `js-yaml`, `nanoid`, `sharp`, `zod`. En développement : `undici`, `vite` (front et API).
- **Les 3 alertes sur `package.json` à la racine visent un fichier qui n'existe pas** (`ls package.json` : absent).
  C'est le cas que `.github/dependabot.yml` décrit depuis le 2026-08-16 : non réévaluables, elles ne se ferment pas
  seules.

**Ce que Dependabot ne voit pas.**

- **composer : 23 avis** sur `takussan-api/composer.lock` (critique 1, hautes 5, moyennes 5, basses 3, sans
  gravité 9). Dependabot n'en montre **aucun** : 0 alerte d'écosystème composer.
  - `laravel/framework` est installé en **v13.25.0**. L'avis critique « TokenGuard authentication bypass through
    non-string API credentials » vise `>=13.0.0,<13.27.0`, et l'avis moyen « relationship inclusion can trigger
    unauthorized data destruction » vise la même plage.
  - `config/auth.php` ne déclare que les pilotes `session` et `eloquent`. L'exposition réelle au `TokenGuard` est
    à **mesurer**, pas à déduire de la configuration.
  - Le second avis rappelle l'incident `include=unguard` du 2026-11-12. Il est à relire contre la liste blanche
    d'`include` posée alors.
  - Autres paquets visés : `league/commonmark` (haute), `phpoffice/phpspreadsheet` (3 hautes), `phpseclib/phpseclib`,
    `symfony/http-foundation` (dont une haute), `symfony/http-kernel`, `symfony/mime`, `symfony/routing`,
    `symfony/yaml`, `symfony/filesystem`, `league/flysystem`.
- **npm de l'API** : `npm audit` en compte 4 (2 critiques : `concurrently`, `shell-quote` ; 2 hautes :
  `source-map-js`, `vite`). Dependabot n'en montre que 5 lignes, toutes sur `vite`.
- **npm du front** : `npm audit` en compte 37 (23 hors développement), dont 2 critiques.

## Contraintes strictes (métier)

- **Après la fusion de #1669**, sur une branche à part, en PR vers `dev`. La CI joue les suites entières ; aucune
  suite entière en local.
- **Mesurer avant de corriger, et après.** Les trois audits et le décompte Dependabot sont relevés au début et à la
  fin, datés, et écrits dans les notes du ticket. Une alerte se ferme par une version installée hors de la plage
  vulnérable, vérifiée dans le lock. Une plage d'avis ne suffit pas : c'est la leçon de `vite` dans
  `dependabot.yml`.
- **`next` d'abord.** Passer à une version qui ferme les critiques et les hautes (au moins 16.4.1). Cela relève le
  plancher de React et d'ESLint du front : `npm run lint`, `npx tsc --noEmit`, `npm run test` et `npm run build`
  doivent passer, puis `deploy/takussan/smoke-web.sh`. La ligne « Next.js 16.3.1 » de `CLAUDE.md` est mise à jour
  dans la même PR.
- **`laravel/framework` dans sa ligne 13** (au moins 13.40.0 pour fermer les quatre avis). Pint et la suite de la CI
  doivent être verts.
- Aucun saut de version majeure n'entre dans ce lot sans décision. Une montée majeure nécessaire (par exemple
  `phpspreadsheet` d'une branche à une autre) devient un ticket à part. TCK-463 (TypeScript 7) reste à part.
- **Les 3 alertes fantômes de `package.json` à la racine** se ferment par une écriture sur GitHub (« dismiss »), qui
  est une action sortante. Elle se fait seulement sur demande du porteur, avec le motif « manifeste inexistant ».
- `.github/dependabot.yml` est en pause (`open-pull-requests-limit: 0`). La lever est hors de ce lot.

## Delta à produire

- [ ] Relevé initial daté (les trois audits et Dependabot), dans les notes.
- [ ] `takussan-web` : `next` et les paquets d'exécution vulnérables à leur version corrigée ; `npm audit` sans
  critique ni haute à l'exécution.
- [ ] `takussan-api` : `composer update` ciblé (`laravel/framework`, `symfony/*`, `league/*`, `phpoffice/phpspreadsheet`,
  `phpseclib/phpseclib`) dans leurs lignes majeures ; `npm` de l'API (`concurrently`, `shell-quote`, `vite`).
- [ ] Mesure de l'exposition au `TokenGuard` avant la montée, écrite dans les notes : route réelle, ou absence de
  route.
- [ ] Relevé final daté, avec la liste de ce qui reste ouvert et pourquoi (pas de correctif, montée majeure, faux
  positif mesuré).

## Critères d'acceptation

- [ ] AC1 — `npm audit --omit=dev` de `takussan-web` ne rend ni critique ni haute.
- [ ] AC2 — `composer audit` de `takussan-api` ne rend ni critique ni haute. Chaque avis restant est listé dans les
  notes avec sa raison.
- [ ] AC3 — `npm audit` de `takussan-api` ne rend aucune critique.
- [ ] AC4 — La CI de la PR est verte sur les trois workflows (API, front, dépôt), et `smoke-web.sh` passe sur l'image
  du front.
- [ ] AC5 — Le décompte Dependabot de fin, relevé par la même commande `gh api` en lecture, est écrit dans les notes,
  avec ce qui reste ouvert.

## Hors périmètre

- Lever la pause de Dependabot, ou ajouter un audit composer à la CI : un ticket à part, qui serait utile puisque
  Dependabot ne voit pas composer.
- TCK-463 (TypeScript 7, bloqué par typescript-eslint).
- Les montées majeures.

## Notes d'implémentation

_(à remplir par implementing-specs)_
