---
id: TCK-299
title: "Le déploiement du frontend n'existe dans aucun workflow ni script du dépôt"
status: doing
phase: P1
family: technique
estimate: M
wave: 38
created: 2026-08-16
updated: 2026-08-20
depends_on: []
blocks: [TCK-288]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, front, deploiement, vercel, dette]
---

## Objectif utilisateur

Qu'on puisse répondre, en lisant le dépôt, à la question « quelle branche déploie quel environnement
front ? » — sans avoir de compte Vercel ni demander à quelqu'un.

## Contrat de données

Aucune donnée applicative. Mesuré le 2026-08-16 :

- `takussan-web/` — environ 870 fichiers `.ts`/`.tsx`, ~110 pages — n'est déployé par **aucun**
  workflow ni script du dépôt.
- Pas de `takussan-web/vercel.json`.
- `deploy.yml` et `deploy-preview.yml` citent **zéro** fichier de `takussan-web/` : les deux ne
  déploient que l'API.
- `web-ci.yml` existe (D-06, soldé le 2026-08-12) mais **teste** ; il ne déploie pas.
- La seule trace de Vercel dans le dépôt est une regex d'origine CORS côté Laravel.

## ✅ Première mesure, obtenue le 2026-08-16 — et sans accès à Vercel

**Le front N'EST PAS « déployé par rien ».** Il est déployé par une **intégration Git Vercel**, et
c'est mesuré : l'ouverture de la PR #176 a fait apparaître deux checks GitHub que le dépôt ne
déclare nulle part —

```
Vercel                    pending   « Vercel is deploying your app »
                          → vercel.com/thiambaras-projects/takussan/6UCsJQJ97xeAeCvUhjzhEPo4NiLF
Vercel Preview Comments   pass
```

Le projet est donc `thiambaras-projects/takussan`, et le déclencheur est l'**intégration côté
Vercel**, pas un workflow. C'est pour cela que `deploy.yml` et `deploy-preview.yml` citent zéro
fichier de `takussan-web/` : ils n'ont jamais eu à le faire.

> **La leçon est la même que D-04, dans l'autre sens.** D-04 disait *« ne jamais déduire l'état d'un
> environnement de la configuration qui le vise »* — et ce ticket avait déduit de l'absence de
> workflow que le déploiement n'existait pas. **Une absence dans le dépôt ne prouve rien : elle
> prouve seulement que le dépôt ne le fait pas.** Il a suffi d'ouvrir une PR pour que le mécanisme
> se montre.

**Ce qui reste à mesurer**, et qui exige toujours le tableau de bord Vercel : quelle branche sert la
production, quelle branche sert la preview, et quelles variables d'environnement le build reçoit.

## Contraintes strictes (métier)

- **Ne rien déduire de la plateforme.** Comme pour D-04, l'existence d'un fichier de configuration
  ne prouve pas qu'un déploiement se produise. Ce que ce ticket écrit sur le mapping
  branche→environnement doit être **vérifié auprès du tableau de bord Vercel**, pas supposé à
  partir des noms de branches.
- Le mapping doit couvrir les trois branches réelles du dépôt : `dev` (intégration), `preview`,
  `master` (figé au 2026-05-18, 31 commits derrière).
- Si le déploiement front reste hébergé par Vercel plutôt que par un workflow du dépôt, c'est une
  **décision structurelle** et elle s'écrit en ADR avant l'implémentation.

## Delta à produire

- [x] Mesurer l'état réel côté Vercel : quels projets, quelles branches de production/preview,
      quelles variables d'environnement — et le consigner avec sa date
      → **fait le 2026-08-20, et SANS tableau de bord Vercel.** Voir « Notes d'implémentation ».
      ⚠ Trois points restent **non mesurables depuis le dépôt** et sont déclarés comme tels dans le
      champ `non_mesure` du relevé, plutôt que devinés.
- [x] ADR : le déploiement front est-il piloté par le dépôt (workflow) ou par Vercel (intégration
      Git) ? Écrire la décision **avant** de toucher au code
      → [ADR-0017](../../adr/0017-deploiement-du-front-pilote-par-vercel.md), écrit avant le
      workflow. Décision : **Vercel garde le déploiement ; le dépôt le relève et le garde.**
- [~] Selon l'ADR : `takussan-web/vercel.json` versionné, ou workflow de déploiement front
      → **ni l'un ni l'autre, et c'est le contenu de la décision.** Un workflow serait un second
      déclencheur en course sur le même jeu de domaines ; un `vercel.json` sans besoin serait une
      copie du réglage Vercel, c'est-à-dire la seconde source de vérité que l'ADR existe pour
      éviter. Le dépôt livre à la place une garde qui **vérifie** et ne déploie rien.
      ⚠ Un `vercel.json` reste justifié pour une **autre** raison, mesurée : l'intégration n'a aucun
      filtre de chemins (cf. Notes). Son fichier est dans `takussan-web/`, hors périmètre ici.
- [x] Documenter le mapping branche→environnement dans `docs/infra/`
      → [`docs/infra/frontend-deploiement.md`](../../infra/frontend-deploiement.md) (prose,
      commandes de re-mesure, limites) + [`frontend-deploiement.json`](../../infra/frontend-deploiement.json)
      (source unique des valeurs, même patron que `prod-drivers.json`).
- [x] Déclarer les variables d'environnement front requises dans un `.env.example` côté
      `takussan-web/`, gardé par `check-env-parity.mjs` ou son équivalent
      → mesuré : le front ne lit **qu'une** variable, `NEXT_PUBLIC_API_URL`, et
      `takussan-web/.env.example` la déclarait déjà. L'« équivalent » est le job `variables` de
      `.github/workflows/front-deploy-map.yml` — `check-env-parity.mjs` compare les deux `.env` de
      l'API entre eux et ne voit pas le front.

## Critères d'acceptation

- [x] AC1 — un lecteur du dépôt peut nommer, sans accès externe, l'environnement front servi par
      chacune des branches `dev`, `preview` et `master`
      → tableau en tête de `docs/infra/frontend-deploiement.md` : `master` → **Production**
      (`www.takussan.com`, public), `dev` et `preview` → **Preview** derrière le SSO Vercel.
      Mesuré, pas supposé — cf. Notes, §1.
- [x] AC2 — la décision « dépôt ou Vercel » est écrite en ADR numéroté, avec ses conséquences
      → ADR-0017, 5 conséquences numérotées et 3 alternatives écartées avec leur motif.
- [x] AC3 — chaque variable d'environnement dont le build front dépend est déclarée dans le dépôt
      → **exécuté**, pas lu : le job `variables` extrait du YAML livré et lancé verbatim sous
      `bash -e` rend `✓ toute variable NEXT_PUBLIC_* lue par le front est déclarée ET relevée`,
      code 0 ; et il rend code 1 quand on retire la clé (ablation A.1) ou l'entrée du relevé
      (ablation A.3). Sorties collées en Notes, §3.
- [x] AC4 — l'état mesuré côté Vercel est daté et cite la commande ou l'écran qui l'a produit
      → le relevé JSON porte un bloc `mesure` daté avec ses deux commandes ; l'ADR colle les
      sorties ; le document `.md` donne six commandes de re-mesure, toutes en lecture seule.

## Hors périmètre

- Le déploiement de l'API — TCK-288.
- Les performances et le CDN images — TCK-105.

## Notes d'implémentation

### 0. Ce qui n'est PAS prouvé, et pourquoi — à lire avant le reste

**Le workflow livré n'a jamais été déclenché par GitHub Actions.** Aucun run n'a été créé pour ce
dépôt depuis le 2026-08-18T00:28Z ; ce ticket ne pouvait donc pas l'observer, et il ne le prétend
pas. Ce qui est prouvé : le YAML parse, et les **corps `run:` extraits du fichier livré** ont été
exécutés verbatim en local sous `bash -e` — vert quand tout va, rouge à chaque ablation.

Ce qui reste non prouvé, nommément : que GitHub déclenche bien ce workflow sur `pull_request`,
`schedule` et `workflow_dispatch` ; que `gh` et `jq` sont présents sur `ubuntu-latest` (ils y sont
documentés, ce n'est pas une mesure) ; que `permissions: deployments: read` suffit au `gh api`
utilisé. **Ces quatre points se cochent au premier run réel, pas avant.** C'est très exactement la
faute payée sur TCK-320 AC7 — un AC coché sur la lecture d'un step qui n'avait jamais tourné.

### 1. La prémisse du ticket était vraie en fait et fausse en conclusion

Le ticket disait *« n'est déployé par aucun workflow ni script du dépôt »* — vrai — puis en tirait
qu'on ne pouvait pas savoir quelle branche déploie quoi *« sans le tableau de bord Vercel »*. Faux.
**Vercel publie son activité sur GitHub.**

```
$ gh api --paginate "repos/thiambara/takussan/deployments?per_page=100" \
    -q '.[] | [.environment, .creator.login] | @tsv' | sort | uniq -c | sort -rn
 212 Preview     vercel[bot]
   3 Production  vercel[bot]
```

Les 3 « Production », et la branche à laquelle ils appartiennent :

```
$ gh api --paginate ".../deployments?per_page=100" \
    -q '.[] | select(.environment=="Production") | [.id,.ref,.created_at] | @tsv'
5921606293  fefe2c87…  2026-08-15T14:57:52Z
4731954942  71d4de34…  2026-05-18T17:42:36Z
4731818062  70342b9c…  2026-05-18T17:30:02Z   (state: failure)

$ git log --first-parent -3 --format='%H %ad' --date=iso origin/master
fefe2c87…  2026-08-15 14:56:07
71d4de34…  2026-05-18 17:40:55
70342b9c…  2026-05-04 02:08:18
```

Correspondance exacte, dans l'ordre. Contrôle sur les autres branches : `--first-parent origin/dev`
et `--first-parent origin/preview` ne contiennent **aucun** des trois.

Domaines, sondes du 2026-08-20 :

```
takussan.com                 307 → https://www.takussan.com/
www.takussan.com             200   server: Vercel · x-powered-by: Next.js
takussan.vercel.app          200
preview.takussan.com         302 → vercel.com/sso-api
takussan-git-{dev,preview,master}-thiambaras-projects.vercel.app   302 → vercel.com/sso-api
app.takussan.com             ne résout pas
```

### 2. Une découverte de bord, plus grave que le ticket lui-même

`NEXT_PUBLIC_*` étant substituée à la compilation, la valeur donnée au build de production se lit
dans le bundle servi. Chunk de `www.takussan.com` :

```js
let e = "https://api.takussan.com".replace(/\/api$/, ""), s = `${e}/api`
```

```
$ curl -o /dev/null -w '%{http_code}\n' https://api.takussan.com/up               → 404
$ curl -o /dev/null -w '%{http_code}\n' https://api.takussan.com/api/properties   → 404 (nginx/1.24.0)
$ curl -o /dev/null -w '%{http_code}\n' https://preview.api.takussan.com/up       → 200
```

**Le front de production est en ligne, public, et appelle une API jamais déployée.** D-04 / TCK-288
décrivaient cette dette sans utilisateur exposé ; il y en a un. Périmètre inchangé, priorité de
TCK-288 changée. Consigné dans l'ardoise, D-10.

### 3. Ablation — et la première version de la garde était VERTE SUR UN RELEVÉ FAUX

Protocole : les deux corps `run:` sont **extraits du YAML livré** (`yaml.safe_load` → fichier) puis
lancés sous `bash -e`, comme le runner (`bash -e {0}`). Ablation sur les entrées, restauration
vérifiée par `diff -q`.

**Garde B — le rouge qui a changé le correctif.** La première version testait
`git merge-base --is-ancestor <ref> origin/<branche>` :

```
=== ABLATION : branche_production = "dev" (le relevé ment) ===
· relevé : la production front est servie par la branche « dev »
✓ 2026-08-15T14:57:52Z  fefe2c87 — sur origin/dev
✓ 2026-05-18T17:42:36Z  71d4de34 — sur origin/dev
✓ 2026-05-18T17:30:02Z  70342b9c — sur origin/dev
✓ le mapping … tient encore
code: 0        ← VERTE SUR UN RELEVÉ FAUX
```

Mécanique : `dev` contient tout `master`, donc tout commit de `master` est aussi un ancêtre de
`dev`. *Un test d'appartenance à une branche qui accepte toutes ses descendantes ne teste rien.*
Sans cette ablation, la garde partait en CI en donnant sa bénédiction à n'importe quel mapping.

Version corrigée — `git rev-list --first-parent` :

```
=== B.0 INTACT ===
✓ 2026-08-15T14:57:52Z  fefe2c87 — pointe de origin/master
✓ 2026-05-18T17:42:36Z  71d4de34 — pointe de origin/master
✓ 2026-05-18T17:30:02Z  70342b9c — pointe de origin/master
· 3 déploiement(s) « Production » examiné(s)
✓ le mapping branche → environnement de … tient encore
code: 0

=== B.1 branche_production = "dev" ===
✗ …  fefe2c87 — PAS sur l'historique en premier parent de origin/dev
✗ …  71d4de34 — PAS sur l'historique en premier parent de origin/dev
✗ …  70342b9c — PAS sur l'historique en premier parent de origin/dev
code: 1

=== B.2 branche_production = "preview" ===   → 3 ✗, code: 1
=== B.3 branche_production = null ===        → ✗ ne déclare pas de branche_production, code: 1

=== B.4 RESTAURATION EXACTE ===
fichier identique à l'original
✓ 3/3 pointe de origin/master · code: 0
```

**Garde A** — bac à sable (copie de `takussan-web/src`, `next.config.ts`, `.env.example` et du
relevé), pour ne pas toucher aux fichiers que d'autres agents tenaient au même moment :

```
=== A.0 INTACT ===              ✓ toute variable NEXT_PUBLIC_* … est déclarée ET relevée   code: 0
=== A.1 clé retirée de .env.example ===
· déclarées (.env.example) : <aucune>
✗ lues par le build mais ABSENTES de takussan-web/.env.example : NEXT_PUBLIC_API_URL      code: 1
=== A.2 RESTAURATION ===        ✓ …                                                        code: 0
=== A.3 variables_build vidé du relevé ===
✗ lues par le build mais ABSENTES de docs/infra/frontend-deploiement.json                  code: 1
=== A.4 RESTAURATION ===        ✓ …                                                        code: 0
```

**Deux défauts trouvés par l'ablation elle-même, et corrigés :**

1. La première rédaction de la garde A ouvrait sur `set -uo pipefail` et enchaînait des `grep` sans
   `|| true`. À l'ablation, elle est sortie en **1 sans imprimer une seule ligne** : le `grep` vide
   sort en 1 et tuait le script avant son premier `echo`. Un rouge muet est un rouge qu'on lit comme
   une panne d'outillage — c'est le défaut D-44 transposé. Chaque `grep` porte désormais `|| true`,
   et le vide est traité comme un résultat nommé.
2. Le message d'erreur contenait `` `undefined` `` entre backticks dans un `echo` en guillemets
   doubles : bash a **exécuté** `undefined`, imprimé `command not found` au milieu du diagnostic et
   vidé le mot du message. Exactement la classe que `check-heredocs.mjs` garde ailleurs. Backticks
   retirés.

### 4. Vérifications de non-régression

```
$ for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done
   → 22 gardes, 22 vertes, aucune ✗   (dont check-doc-links, qui balaie docs/adr récursivement)
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/front-deploy-map.yml'))"
   → jobs: ['variables', 'mapping'] · permissions: contents:read, deployments:read
$ bash -n <corps run: extraits>   → A: syntaxe OK · B: syntaxe OK
$ jq -e . docs/infra/frontend-deploiement.json   → JSON valide
```

Aucun test PHP ni Vitest n'a été lancé : ce ticket ne touche ni `takussan-api/` ni `takussan-web/`.

### 5. Ce que ce ticket laisse derrière lui

- **`CLAUDE.md` est faux sur `master`**, et le sujet n'est plus cosmétique puisque `master` sert le
  site public : *« figé au 2026-05-18, 31 commits derrière `dev` »* contre, mesuré,
  `fefe2c87 2026-08-15` et `git rev-list --count origin/master..origin/dev` → **273**. Hors
  périmètre de ce ticket (fichier racine, tenu par d'autres travaux en cours).
- **L'intégration Vercel n'a aucun filtre de chemins** : `6f38de67`, qui ne touche qu'un fichier de
  `docs/backlog/`, a produit le déploiement Preview `6001431629`. Correctif : `ignoreCommand` dans
  `takussan-web/vercel.json` — fichier hors périmètre. Mérite son propre ticket.
- **`takussan-web/next.config.ts` cite « ADR-0033 »**, numéro qui n'existe pas : le React Compiler
  est ADR-**0015**. Fichier hors périmètre (tenu par TCK-328).
- **Trois inconnues assumées** (attribution de `preview.takussan.com`, Root Directory Vercel,
  variables non `NEXT_PUBLIC_`) : elles exigeraient un jeton d'API Vercel en secret de CI. Elles
  sont déclarées dans `non_mesure`, pas devinées.
