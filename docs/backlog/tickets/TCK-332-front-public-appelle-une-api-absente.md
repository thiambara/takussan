---
id: TCK-332
title: "Le front de production est public et appelle une API qui n'existe pas"
status: todo
phase: P0
family: technique
estimate: S
wave: 38
created: 2026-08-20
updated: 2026-08-20
depends_on: []
blocks: [TCK-288]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [infra, front, deploiement, vercel, production, dette]
---

## Objectif utilisateur

Qu'un visiteur qui ouvre `https://www.takussan.com/` obtienne soit une application qui répond, soit
un état d'attente explicite — mais jamais, comme aujourd'hui, une page qui se charge et dont chaque
appel de données meurt en silence.

## Contrat de données

Aucune donnée applicative nouvelle. Le mapping branche → environnement, les domaines et les
variables de build ne sont **pas** recopiés ici : leur source unique est
[`docs/infra/frontend-deploiement.json`](../../infra/frontend-deploiement.json), gardée par
`.github/workflows/front-deploy-map.yml` (ADR-0017). Ce qui suit est la **re-mesure du 2026-08-20**
qui motive ce ticket, et deux faits que le relevé ne porte pas encore.

### 1. Le site public est servi par `master`, et un merge vers `master` le publie aujourd'hui

```
$ gh api --paginate "repos/thiambara/takussan/deployments?per_page=100" \
    -q '.[] | [.environment,.creator.login] | @tsv' | sort | uniq -c
 212 Preview     vercel[bot]
   3 Production  vercel[bot]

$ gh api --paginate ".../deployments?per_page=100" \
    -q '.[] | select(.environment=="Production") | [.id,.sha,.created_at] | @tsv'
5921606293  fefe2c871db0186e4bb7094f2d2cb2048054cfc7  2026-08-15T14:57:52Z
4731954942  71d4de341c7226e56c25d0ca752bfbdd83c803ed  2026-05-18T17:42:36Z
4731818062  70342b9c8ff5e305ef1050b743bfa6eaf182353c  2026-05-18T17:30:02Z

$ git log --first-parent -3 --format='%h %ad' --date=iso origin/master
fefe2c87 2026-08-15 14:56:07 +0000
71d4de34 2026-05-18 17:40:55 +0000
70342b9c 2026-05-04 02:08:18 +0000

$ git rev-list --count origin/master..origin/dev      → 273
```

Correspondance exacte, dans l'ordre, avec les trois derniers commits en premier parent de
`origin/master`. **Le merge vers `master` n'est pas une opération d'archivage : c'est une mise en
ligne publique**, et rien dans `CLAUDE.md` ni dans le workflow git du dépôt ne le dit.

### 2. Ce que le visiteur obtient réellement — capture d'exécution, pas lecture de bundle

Chargement de `https://www.takussan.com/properties` dans un navigateur réel (Chrome DevTools),
requêtes `xhr`/`fetch` du chargement :

```
GET https://www.takussan.com/api/maintenance/status            [404]
GET https://api.takussan.com/api/public/property-types          [net::ERR_FAILED]
GET https://api.takussan.com/api/public/properties/search?per_page=30  [net::ERR_FAILED]
```

Console :

```
[error] Access to fetch at 'https://api.takussan.com/api/public/property-types' from origin
        'https://www.takussan.com' has been blocked by CORS policy: No 'Access-Control-Allow-Origin'
        header is present on the requested resource.
[error] Access to fetch at 'https://api.takussan.com/api/public/properties/search?per_page=30' …
```

C'est **exactement** le piège que `CLAUDE.md` décrit pour le préfixe `/api` — l'absence de réponse
ne se présente pas comme un 404 lisible mais comme un `net::ERR_FAILED` par CORS. Ici la cause n'est
pas un chemin manquant : c'est l'hôte entier.

```
$ curl -o /dev/null -w '%{http_code}' https://api.takussan.com/up                       → 404
$ curl -s https://api.takussan.com/up | tail -3
  <hr><center>nginx/1.24.0 (Ubuntu)</center>
$ curl -o /dev/null -w '%{http_code}' https://preview.api.takussan.com/up               → 200
$ curl -o /dev/null -w '%{http_code}' https://www.takussan.com/                         → 200
```

Le 404 est celui du **serveur nginx par défaut**, pas d'une application Laravel : aucun vhost ne
sert cet hôte. La preview, sur la même machine, répond 200.

### 3. Deux faits que le relevé ne porte pas encore

- **`https://www.takussan.com/api/maintenance/status` rend 404** — une route BFF du front, sur le
  front lui-même. Le build de production date du 2026-08-15 et porte 273 commits de retard : la
  panne ne se limite donc pas à l'API distante.
- **La garde livrée par TCK-299 relève la variable, elle ne la sonde jamais.** Mesuré :
  `.github/workflows/front-deploy-map.yml` ne contient ni `curl` ni `%{http_code}`. Son job
  `variables` prouve que `NEXT_PUBLIC_API_URL` est *déclarée* et *relevée* ; il resterait vert le
  jour où l'hôte qu'elle nomme cesse de répondre — c'est-à-dire aujourd'hui.

## Contraintes strictes (métier)

- **Ce ticket ne déploie pas l'API.** La première mise en production est TCK-288 : action sortante,
  difficilement réversible, qui appartient à une personne. Ce ticket traite l'**exposition**, pas la
  cause.
- **Aucun correctif ne doit vivre uniquement dans le tableau de bord Vercel.** ADR-0017 pose que le
  dépôt relève et garde ce qu'il ne pilote pas : toute mesure prise côté Vercel se consigne dans
  `docs/infra/frontend-deploiement.json` avec sa date, sinon elle est invisible au prochain lecteur.
- **Ne pas faire pointer le front de production sur `preview.api.takussan.com`** sans décision
  écrite : cet hôte répond 200 et publiquement, ce qui rend le raccourci tentant et exposerait des
  données de preview sous le domaine public.
- La garde ajoutée doit **échouer quand elle ne peut pas mesurer**, jamais passer en silence — même
  règle que le job `mapping` (ADR-0017, conséquence n°2).

## Delta à produire

- [ ] Trancher, et écrire la décision : **(A)** laisser le site public en l'état jusqu'à TCK-288,
      **(B)** replier `www.takussan.com` derrière la protection de déploiement Vercel ou une page
      d'attente jusqu'à ce que l'API réponde, **(C)** rendre l'échec lisible côté front (état
      d'erreur explicite au lieu d'une liste vide silencieuse).
- [ ] Consigner l'exposition dans `docs/infra/frontend-deploiement.md` (prose) et dans le champ
      `alerte` du relevé JSON — avec la date de re-mesure.
- [ ] **Sonder, et non plus seulement relever** : étendre le job `variables` de
      `.github/workflows/front-deploy-map.yml` (ou ajouter un job) qui interroge l'URL nommée par
      `valeur_production_mesuree` et rougit si elle ne répond pas, tant que le domaine front est
      public.
- [ ] Écrire dans `CLAUDE.md` — section « Workflow git » — que `master` sert le site **public**.
      *(Fichier racine tenu par d'autres travaux : à coordonner, pas à forcer.)*

## Critères d'acceptation

- [ ] AC1 — la décision A/B/C est écrite, datée, et pointe le fichier qui la porte.
- [ ] AC2 — un chargement de `https://www.takussan.com/properties` dans un navigateur réel ne
      produit plus aucun `net::ERR_FAILED` : soit les requêtes aboutissent, soit la page n'est plus
      publique, soit l'échec est rendu à l'écran. **Vérifié par capture réseau, pas par lecture du
      code.**
- [ ] AC3 — la garde de CI **rougit** quand l'API nommée par `NEXT_PUBLIC_API_URL` ne répond pas, et
      cette assertion est prouvée par **ablation** : sortie rouge collée avec une URL injoignable,
      sortie verte collée après restauration.
- [ ] AC4 — `docs/infra/frontend-deploiement.json` déclare l'exposition (front public / API absente)
      et sa date, et aucun autre document ne la recopie.
- [ ] AC5 — le fait que `master` publie le site public est écrit là où on décide de merger.

## Hors périmètre

- **Le déploiement de l'API — TCK-288.** Ce ticket ne le fait pas, ne le planifie pas et ne
  redécrit pas son contenu.
- Le choix de la branche de production de l'API (options A/B/C de TCK-288) et le peuplement des
  index Meilisearch.
- Le filtre de chemins de l'intégration Vercel — TCK-333.
- Le déploiement front lui-même : il reste piloté par Vercel (ADR-0017), ce ticket ne le rapatrie
  pas.

### Pourquoi `blocks: [TCK-288]` et non `depends_on: [TCK-288]`

Les deux lectures se défendent, et c'est le sens de la flèche qui compte.

`depends_on` dirait « on ne peut rien faire tant que l'API n'est pas déployée ». **C'est faux, et
c'est exactement l'erreur à ne pas commettre** : la mitigation — replier le domaine, ou rendre
l'échec visible — est disponible aujourd'hui, sans toucher au serveur, et attendre TCK-288 revient à
laisser un site public cassé en ligne pendant qu'une décision d'infrastructure mûrit.

`blocks` dit l'inverse, et c'est mesuré dans TCK-288 lui-même : sa première exécution est un
déploiement jamais exercé, dont AC5 rappelle que les sept index Meilisearch seraient **vides sans
lever d'exception**. Aujourd'hui, un `api.takussan.com` qui se met à répondre ne fait pas que
réparer une API : il **ouvre au public** un site qui l'attend déjà, et le premier déploiement de
production deviendrait, sans que personne l'ait décidé, un lancement public. La position à tenir sur
l'exposition doit donc être arrêtée *avant*.

> ⚠️ La réciprocité n'est pas posée : `TCK-288.depends_on` ne cite pas encore `TCK-332`.
> `check-backlog.mjs` le signale en **avertissement** (pas en erreur) — c'est une ligne à ajouter
> dans TCK-288, hors du périmètre de ce ticket.

## Notes d'implémentation

_(à remplir par implementing-specs)_
