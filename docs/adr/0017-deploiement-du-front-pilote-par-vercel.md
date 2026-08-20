# ADR-0017 — Le déploiement du front reste piloté par Vercel ; le dépôt le relève et le garde, il ne le double pas

- **Statut** : Accepté
- **Date** : 2026-08-20
- **Tickets** : TCK-299 (décision et mise en œuvre), TCK-288 / dette D-04 (le déploiement de l'API, hors périmètre mais convoqué par la mesure ci-dessous)

## Contexte

TCK-299 s'ouvrait sur une déduction, et elle était fausse :

> `takussan-web/` — environ 870 fichiers `.ts`/`.tsx`, ~110 pages — n'est déployé par **aucun**
> workflow ni script du dépôt.

La prémisse *factuelle* tient — aucun workflow du dépôt ne cite `takussan-web/` autrement que pour
le tester. La conclusion qu'on en tirait, elle, ne tenait pas : **le front est déployé, et il l'est
depuis le 2026-05-04.** C'est la leçon de D-04 dans l'autre sens. D-04 disait *« ne jamais déduire
l'état d'un environnement de la configuration qui le vise »* ; ici on avait déduit l'inexistence
d'un déploiement de l'**absence** de configuration. *Une absence dans le dépôt ne prouve rien sur le
monde : elle prouve seulement que le dépôt ne le fait pas.*

## La mesure — 2026-08-20, sans le moindre accès au tableau de bord Vercel

Le ticket annonçait que la suite « exige toujours le tableau de bord Vercel ». Elle ne l'exigeait
pas. Vercel **publie** son activité sur GitHub, sous forme de *Deployments*, et le front **publie**
ses variables `NEXT_PUBLIC_*` dans le bundle qu'il sert.

### 1. Le mécanisme et le mapping — API GitHub

```
$ gh api --paginate "repos/thiambara/takussan/deployments?per_page=100" \
    -q '.[] | [.environment, .creator.login] | @tsv' | sort | uniq -c | sort -rn
 212 Preview     vercel[bot]
   3 Production  vercel[bot]
```

**215 déploiements, tous créés par `vercel[bot]`, aucun par un workflow du dépôt.** Les trois
« Production » :

```
5921606293  Production  fefe2c87…  2026-08-15T14:57:52Z
4731954942  Production  71d4de34…  2026-05-18T17:42:36Z
4731818062  Production  70342b9c…  2026-05-18T17:30:02Z   (state: failure)
```

Ces trois refs sont **exactement** les trois derniers commits de
`git log --first-parent origin/master`. Et ils n'apparaissent sur l'historique en premier parent
d'**aucune** autre branche :

| ref Production | sur `--first-parent origin/master` | sur `origin/dev` | sur `origin/preview` |
|---|---|---|---|
| `fefe2c87` | oui | non | non |
| `71d4de34` | oui | non | non |
| `70342b9c` | oui | non | non |

> ⚠️ **`git branch --contains` ne sert à rien pour cette question**, et c'est le piège qui a coûté
> une réécriture de la garde : `origin/dev` **contient** les trois commits, puisque `dev` a récupéré
> `master`. Le test « est un ancêtre de » est donc vrai pour `dev` comme pour `master` — voir
> « Conséquences », point 4.

### 2. Les domaines — sondes HTTP publiques, 2026-08-20

```
takussan.com                                             307 → https://www.takussan.com/
www.takussan.com                                         200  server: Vercel · x-powered-by: Next.js
takussan.vercel.app                                      200
preview.takussan.com                                     302 → vercel.com/sso-api
takussan-git-preview-thiambaras-projects.vercel.app      302 → vercel.com/sso-api
takussan-git-dev-thiambaras-projects.vercel.app          302 → vercel.com/sso-api
takussan-git-master-thiambaras-projects.vercel.app       302 → vercel.com/sso-api
app.takussan.com                                         ne résout pas
```

Le site de production est **public** ; toutes les preview, y compris l'alias de branche de `master`,
sont derrière l'authentification Vercel.

### 3. Les variables du build — lues dans le bundle servi en production

`NEXT_PUBLIC_*` est substituée **à la compilation** : la valeur donnée au build est donc lisible
dans le JavaScript livré, sans jeton ni tableau de bord. Dans un chunk de `www.takussan.com` :

```js
let e = "https://api.takussan.com".replace(/\/api$/, ""), s = `${e}/api`
```

`NEXT_PUBLIC_API_URL = https://api.takussan.com` en Production. C'est la seule variable que le code
front lise, hors `NODE_ENV` que Next pose lui-même (39 occurrences contre 9, mesurées sur
`takussan-web/src` + `next.config.ts`).

### 4. Ce que cette mesure a révélé au passage, et qui n'était pas la question

```
$ curl -o /dev/null -w '%{http_code}' https://api.takussan.com/up               → 404
$ curl -o /dev/null -w '%{http_code}' https://api.takussan.com/api/properties   → 404 (nginx/1.24.0)
$ curl -o /dev/null -w '%{http_code}' https://preview.api.takussan.com/up       → 200
```

**Le front de production est en ligne, public, et il appelle une API qui n'a jamais été déployée.**
D-04 décrivait « la production n'a jamais été déployée » comme une dette d'infrastructure sans
utilisateur exposé. Elle en a un : `www.takussan.com`. Cela ne change pas le périmètre de TCK-299,
cela change la **priorité** de TCK-288.

## Décision

**Le déploiement du front reste piloté par l'intégration Git de Vercel. Le dépôt ne le double pas
d'un workflow ; il en tient le relevé et le garde.**

Concrètement :

1. `docs/infra/frontend-deploiement.json` est la **source unique** du mapping branche →
   environnement, des domaines et des variables de build. Aucun autre document ne recopie ces
   valeurs — même patron que `docs/infra/prod-drivers.json` (TCK-300) et `versions.json` (TCK-298).
2. `docs/infra/frontend-deploiement.md` est la prose : le raisonnement, les commandes de re-mesure,
   et ce qui n'est **pas** mesurable depuis le dépôt.
3. `.github/workflows/front-deploy-map.yml` **vérifie** ce relevé contre l'API GitHub à chaque PR
   touchant le front ou le relevé, plus une fois par semaine. Il ne déploie rien et ne détient
   aucun secret Vercel.

### Pourquoi pas un workflow de déploiement dans le dépôt

- **Il serait un second déclencheur en course avec le premier.** Le projet Vercel n'a qu'un jeu de
  domaines. Deux mécanismes qui poussent sur la même production ne se répartissent pas le travail,
  ils se doublent — et le dernier arrivé gagne, ce qui n'est pas une politique de déploiement.
- **Le mécanisme existant, lui, a tourné 215 fois — et il a abouti 215 fois.** `deploy.yml`, écrit
  dans le dépôt, n'a **jamais abouti** : deux tentatives le 2026-08-15, deux échecs
  (`gh run list --workflow=deploy.yml` → runs `31891294106` et `31894037166`, tous deux `failure`,
  sur `SQLSTATE[HY000] [1045] Access denied for user 'takussan_prod'@'localhost'`), cf. D-04 et
  TCK-288. Sur ce dépôt, la preuve empirique est du côté de l'intégration.
- **Le désactiver côté Vercel pour le réécrire ici est une migration**, avec sa fenêtre de
  production morte, et personne ne l'a demandée. Ce n'est pas la dette que TCK-299 nomme : celle-là
  était *« on ne peut pas répondre, en lisant le dépôt, à la question quelle branche déploie quoi »*.
  Un relevé gardé y répond ; un workflow n'y ajoute rien.

### Pourquoi pas non plus un `takussan-web/vercel.json` dans cette décision

Il en faudra peut-être un, mais pour une **autre** raison, et elle est mesurée : l'intégration n'a
**aucun filtre de chemins**. Le commit `6f38de67` ne touche qu'un seul fichier —
`docs/backlog/tickets/TCK-320-selection-des-tests-par-impact.md` — et a produit le déploiement
Preview `6001431629`. Chaque commit de documentation ou d'API reconstruit donc le front entier.
C'est un gaspillage réel, pas une panne, et son correctif (`ignoreCommand`) touche `takussan-web/`,
hors du périmètre de TCK-299. **Écrire un `vercel.json` sans ce besoin reviendrait à versionner une
copie du réglage Vercel, c'est-à-dire à créer la deuxième source de vérité que cet ADR existe pour
éviter.**

## Conséquences

1. **Un lecteur du dépôt peut répondre à la question de TCK-299** sans compte Vercel :
   `master → Production (www.takussan.com)`, `dev` et `preview → Preview, protégées par SSO`.
2. **Le relevé peut mentir, et c'est prévu.** Le mapping vit dans un tableau de bord que le dépôt ne
   contrôle pas ; il peut changer un mardi sans qu'aucun commit ne soit poussé. C'est pourquoi la
   garde tourne aussi `on: schedule`, et pourquoi elle échoue quand elle **ne peut pas** mesurer
   plutôt que de passer en silence.
3. **La garde observe le résultat, jamais le réglage.** Elle lit ce que Vercel publie sur GitHub.
   L'attribution du domaine `preview.takussan.com` à une branche n'est pas publiée : elle reste
   **non mesurée**, et le relevé le déclare au lieu de la deviner.
4. **Le test d'appartenance est « pointe de la branche », pas « ancêtre de la branche »** — et cette
   ligne est ici parce que la première version de la garde a été livrée *verte sur un relevé faux*.
   Ablation du 2026-08-20 : en remplaçant `master` par `dev` dans le relevé, la version « ancêtre »
   passait 3/3. Mécanique : `dev` contient tout `master`. La version « premier parent » rougit 3/3
   sur `dev` comme sur `preview`. *Un test d'appartenance à une branche qui accepte toutes ses
   descendantes ne teste rien.*
5. **Cet ADR ne prouve pas que la garde tourne en CI.** Aucun run GitHub Actions n'a été créé pour
   ce dépôt depuis le 2026-08-18T00:28Z. Les deux `run:` ont été extraits du YAML livré et exécutés
   **verbatim** en local sous `bash -e` ; leur déclenchement par GitHub, lui, reste non observé.
   C'est précisément la faute de TCK-320 AC7 — cocher sur une lecture — et elle est nommée ici
   plutôt que tue.

## Alternatives écartées

| Option | Pourquoi non |
|---|---|
| Workflow `deploy-front.yml` avec `vercel --prod` et un jeton | Second déclencheur en course ; un secret Vercel de plus à détenir ; et le mécanisme remplacé est le seul des deux qui ait jamais tourné. |
| Écrire le mapping en prose dans `docs/` et s'arrêter là | C'est la forme exacte de la dette que ce dépôt paie le plus cher — `INDEX.md` faux sur 213 de ses 266 entrées. Une valeur qui vit ailleurs et qu'on recopie est fausse à la première divergence, avec l'autorité d'un document. |
| Interroger l'API Vercel avec un jeton en secret de CI | Mesure plus riche (le réglage, pas seulement le résultat) mais exige un secret à longue durée de vie dans un dépôt qui n'en détient aucun pour Vercel. À reconsidérer si le champ `non_mesure` du relevé devient bloquant. |

## Voir aussi

- [`docs/infra/frontend-deploiement.md`](../infra/frontend-deploiement.md) — le relevé en prose et les commandes de re-mesure
- [ADR-0001](0001-monorepo-laravel-nextjs.md) — le monorepo, dont ce déploiement asymétrique est une conséquence directe
