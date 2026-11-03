---
id: TCK-348
title: "Préproduction : la compression n'est pas active, et la branche est 34 commits derrière `dev`"
status: done
phase: P2
family: technique
estimate: S
wave: 45
created: 2026-08-22
updated: 2026-08-24
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [infra, nginx, deploiement, performance, dette]
---

## Objectif utilisateur

Que ce que le dépôt a mesuré et corrigé sur le catalogue public — la revalidation par ETag, le `Vary`
qui empêche un cache partagé de servir la page d'un francophone à un anglophone, et la compression —
**arrive réellement devant un navigateur**.

## Pourquoi ce ticket existe séparément

Il porte l'**AC5 de [TCK-341](TCK-341-cache-http-du-catalogue-public.md)**, extrait le 2026-08-22.

TCK-341 a livré et mergé quatre critères sur cinq. Le cinquième — « la compression est active en
préproduction » — **ne peut pas être fermé depuis le dépôt**, et le laisser dans un ticket applicatif
faisait porter à celui-ci une dette qui n'est pas de sa nature. *Un critère d'acceptation qui dépend
d'un déploiement ne se ferme pas dans le dépôt qui le décrit.*

## Ce qui est mesuré (2026-08-22)

### 1. La compression n'est pas active

```
$ curl -sI -H 'Accept-Encoding: gzip' \
    'https://preview.api.takussan.com/api/public/properties/search?per_page=20'
HTTP/2 200
cache-control: no-cache, private
vary: Origin
(aucun content-encoding)
```

Corps identique en `identity`, `gzip` et `gzip, br` : **21 300 octets** dans les trois cas. Le même corps
passé à `gzip -6` rend **3 212 octets, soit 15,1 %** — 85 % de la charge utile de recherche voyage pour
rien, sur un marché où le mobile domine.

nginx/1.24.0 (Ubuntu), dont les défauts expliquent exactement le relevé : `gzip_types` vaut `text/html`
seul et `gzip_proxied` vaut `off`, ce qui écarte les réponses FastCGI.

### 2. Le bloc gzip existe dans le dépôt, et rien ne l'exécute

`scripts/server-setup.sh:241-245`, dans le heredoc `<<NGINX` de `setup_nginx_vhost` :

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_types application/json;
gzip_min_length 1024;
```

`grep -rn 'server-setup' .` → **aucun workflow ne l'exécute**. `scripts/deploy.sh:372` écrit lui-même
que ce script est manuel ; `deploy-preview.yml` ne lance que `deploy.sh`, qui ne touche pas au vhost.

### 3. ⚠ Et la compression seule ne suffirait pas — la préproduction ne porte pas TCK-341

C'est le fait qui a motivé l'ouverture de ce ticket plutôt qu'une simple note.

```
$ git log -1 --format='%h %ad' --date=iso origin/preview
c8b77d90 2026-08-20 21:15:40 +0000
$ git rev-list --count origin/preview..origin/dev     → 34
$ git rev-list --count origin/dev..origin/preview     → 4
```

**`origin/preview` n'est pas un ancêtre de `dev`** : elle porte 4 commits propres et lui manque 34.
La réponse ci-dessus le confirme depuis l'extérieur — `search` sort **sans ETag**, et `discovery` avec
`Vary: Origin` seul au lieu de `Vary: Accept-Language, Authorization, Origin`.

Relancer `server-setup.sh` activerait donc la compression sur une API qui ne revalide toujours rien et
dont un cache partagé peut encore mélanger deux locales.

### 4. Aucun chemin depuis le dépôt ni depuis une machine d'agent

| Ce qu'il faudrait | Mesure du 2026-08-22 |
|---|---|
| une clé privée | `ls -la ~/.ssh/` → aucune. `ssh-add -l` → *The agent has no identities.* |
| l'hôte | `dig +short preview.api.takussan.com` → `178.18.247.62`, présent dans `known_hosts` |
| la connexion | `ssh -o BatchMode=yes 178.18.247.62 true` → `Permission denied (publickey,password)` |
| les secrets | `gh secret list` → `CONTABO_HOST`, `CONTABO_USER`, `CONTABO_SSH_KEY` — présents et illisibles |

**Ce ticket demande une action humaine**, ou un delta de code qui rende l'action automatique. Les deux
sont recevables ; la seconde est plus durable.

## Delta à produire

- [x] **Décidé — ni l'une ni l'autre des deux options énoncées.** Le bloc gzip est posé dans
      `/etc/nginx/conf.d/gzip.conf`, au niveau `http`, et non dans un vhost. Motif : `server-setup.sh`
      réécrit les vhosts avec `cat >` sans lire ce qui s'y trouvait — une directive posée dans un
      vhost, à la main **ou** par `deploy.sh`, disparaîtrait au prochain provisionnement, en silence.
      *La question n'était pas « qui applique le vhost » mais « pourquoi la compression vivrait-elle
      dans un fichier qu'un autre script réécrit ».*
- [x] **`preview` est alignée sur `dev`** — et ses commits propres ne portaient rien : voir AC4.
- [x] Mesure d'après consignée ci-dessous, à côté de celle d'avant.

## Critères d'acceptation

- [x] AC1 — `curl -sI -H 'Accept-Encoding: gzip' …/api/public/properties/search?per_page=20` rend un
      `Content-Encoding: gzip`, et le corps compressé est **mesuré** (l'ordre de grandeur attendu est
      ~3,2 ko contre 21,3 ko).
- [x] AC2 — la même requête rend un **ETag**, et une seconde requête portant `If-None-Match` rend
      **304**. *Sans cet AC, on aurait compressé une réponse que personne ne revalide.*
- [x] AC3 — `/api/public/properties/discovery` rend `Vary` contenant `Accept-Language` **et**
      `Authorization`. C'est le seul défaut de TCK-341 qui vivait réellement en production.
- [x] AC4 — le sort des **4 commits propres** de `origin/preview` est écrit : reportés sur `dev`,
      ou constatés obsolètes avec la raison. *Une branche qu'on écrase sans regarder ce qu'elle porte
      est une régression qu'on ne saura pas nommer.*
- [x] AC5 — si le choix se porte sur l'automatisation : l'application du vhost est **idempotente** et
      un second passage ne casse rien. Prouvé en le jouant deux fois.

## Ce que ce ticket ne fait pas

- Il ne traite pas la production (`api.takussan.com` → 404) : c'est [TCK-288](TCK-288-premiere-mise-en-production.md).
- Il ne touche pas au cache applicatif, laissé hors périmètre par TCK-341.

---

## Mesure d'après — 2026-08-24, sur `preview.api.takussan.com`

Correctif : `/etc/nginx/conf.d/gzip.conf` (niveau `http`, hors vhost), `gzip_vary on`,
`gzip_proxied any`, `gzip_comp_level 5`, `gzip_min_length 512`, et un `gzip_types` qui nomme
`application/json`. `nginx -t` avant chaque rechargement.

**Le relevé du 2026-08-22 était exact mais incomplet.** Il disait « `gzip_types` vaut `text/html` seul
et `gzip_proxied` vaut `off` ». Vérifié sur la machine : `nginx.conf` ne portait **que** `gzip on;`,
sans aucune autre directive gzip — tout le reste venait des défauts. La conséquence se voyait à l'œil
nu et personne ne l'avait regardée : `/up`, qui est du `text/html`, **était compressé**, pendant
qu'aucune réponse JSON ne l'était. *Le symptôme portait sa propre explication.*

| Critère | Avant (2026-08-22) | Après (2026-08-24) |
|---|---|---|
| AC1 · `search?per_page=20` | aucun `Content-Encoding`, 21 300 o | `Content-Encoding: gzip` — **3 813 o** contre 20 495 o en `identity`, facteur **5,4** |
| AC2 · ETag / 304 | absent du relevé | `ETag: "8dedc5210f8d0f003b9c9ddf9fd47da5"`, puis `If-None-Match` → **304**, 0 octet |
| AC3 · `Vary` sur `discovery` | `Vary: Origin` seul | `Vary: Accept-Language, Authorization, Origin` |
| AC4 · commits propres de `preview` | 4, sort inconnu | **8, tous des commits de fusion `dev` → `preview`** ; `git diff --stat origin/dev origin/preview` rend **0 ligne** — les arbres sont identiques, aucun correctif d'urgence n'y dormait |
| AC5 · idempotence | — | écrire un fichier de `conf.d/` est idempotent par construction ; appliqué deux fois, `nginx -t` vert les deux fois |

⚠️ **Deux erreurs de MESURE, les miennes, corrigées — et elles se ressemblent.** Ma première
extraction de l'ETag a rendu « aucun » alors que l'en-tête était bien présent (découpage fautif sur
le préfixe `W/`), et mon premier `curl` comparait `gzip` à `identity` sans voir que curl ne décode
pas sans `--compressed`. *Une commande de vérification qui se trompe ne rend pas une erreur : elle
rend un résultat, et ce résultat a exactement la forme de la réponse attendue.*

## Ce que ce ticket laisse au suivant

La compression est posée **sur le serveur**, pas dans le dépôt. Aucune garde ne la protège : une
réinstallation, ou un `server-setup.sh` qui apprendrait un jour à écrire dans `conf.d/`, la
reprendrait sans que rien ne le dise. Le fichier porte son propre motif en en-tête — c'est le seul
mécanisme dont il dispose, et il ne vaut que pour qui l'ouvre.
