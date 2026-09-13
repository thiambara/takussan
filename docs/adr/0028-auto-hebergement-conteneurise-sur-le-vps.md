# ADR-0028 — Les deux projets s'auto-hébergent en conteneurs sur le VPS, orchestrés par Dokploy ; Vercel et la chaîne bash sont retirés

- **Statut** : Accepté
- **Date** : 2026-09-13
- **Plan** : [`docs/plans/2026-09-13-auto-hebergement-vps-dokploy.md`](../plans/2026-09-13-auto-hebergement-vps-dokploy.md)
- **Remplace** : [ADR-0017](0017-deploiement-du-front-pilote-par-vercel.md) — **à la bascule du front de production** (phase F du plan) ; d'ici là, ADR-0017 décrit toujours ce qui sert `www.takussan.com`. Remplace aussi une décision recensée et jamais rédigée : *« déploiement zero-downtime par script bash sur VPS — pas de conteneur, pas d'orchestrateur »* ([index](README.md)).
- **Dettes et tickets concernés** : D-04, D-09, D-10 · TCK-288, TCK-332, TCK-333
- **Périmètre** : le serveur est **partagé** avec CheckPrint Plus (`thiambara/check-print-plus`). Cet ADR fixe les règles du serveur pour les deux projets ; les fichiers propres à CheckPrint Plus vivent dans son dépôt.

## Contexte

### Ce qui sert quoi — mesuré le 2026-09-13

| Surface | Hébergée par | Mesure |
|---|---|---|
| `www.takussan.com` — front de production, **public** | Vercel | 200 · `x-vercel-id: lhr1::iad1::…` |
| `preview.takussan.com` | Vercel, derrière le SSO | ADR-0017 |
| `api.takussan.com` | VPS Contabo `178.18.247.62`, nginx + php-fpm | **404** — jamais servi (D-04) |
| `preview.api.takussan.com` | même VPS | 200 |
| `checkprintplus.com` / `www.checkprintplus.com` | Vercel | `server: Vercel` · 200 sur `www` |
| `preview.checkprintplus.com` | Vercel, derrière le SSO | 302 → `vercel.com/sso-api` |
| `api.checkprintplus.com`, `preview.api.checkprintplus.com` | même VPS | **`000`** — la connexion échoue |
| DNS de `takussan.com` et `checkprintplus.com` | **Cloudflare, déjà** | `dig NS` → `alec.ns.cloudflare.com`, `fish.ns.cloudflare.com` |

```bash
curl -sS -o /dev/null -D - https://www.takussan.com/ | grep -i x-vercel-id
curl -sS -m 10 -o /dev/null -w '%{http_code} %{remote_ip}\n' https://api.checkprintplus.com/up
dig +short NS takussan.com; dig +short NS checkprintplus.com
gh repo view thiambara/takussan --json visibility          # PUBLIC
gh repo view thiambara/check-print-plus --json visibility  # PRIVATE
```

### Trois faits rendent la décision possible — et utile — maintenant

**1. Il n'y a aucune donnée de production.** L'API Takussan n'a jamais servi (D-04), celle de
CheckPrint Plus ne répond pas, et le porteur ne prévoit pas de mise en production avant trois mois
au moins. Le serveur ne porte que des préproductions : il peut être **réinstallé à blanc**. C'est la
fenêtre qu'[ADR-0020](0020-postgresql-sur-tous-les-environnements.md) a exploitée pour changer de
moteur, et elle ne se rouvrira pas une fois des clients servis.

**2. Le rendu serveur du front traverse l'Atlantique.** `lhr1::iad1` : le visiteur entre par
Londres, mais la fonction qui rend la page tourne à **Washington**. Or elle appelle l'API, en
Europe, et souvent : la fiche publique d'un bien appelle `getProperty` deux fois côté serveur
(`generateMetadata` et le corps de la page), et le front compte **31 route handlers BFF** et
**20 modules de server actions**. Chacun de ces appels fait un aller-retour transatlantique. Placer le
front à côté de l'API les rend locaux ; c'est un gain de latence avant d'être un gain de coût.

**3. La chaîne actuelle ne se reconstruit pas depuis le dépôt, et n'a jamais abouti en production.**
`scripts/server-setup.sh` se lance à la main et aucun workflow ne l'exécute ; les versions sont
posées par `apt` sans être épinglées (D-09) ; la base de données se provisionne en se connectant
(TCK-288) ; le front est entièrement hors dépôt (D-10). Les deux exécutions de `deploy.yml` du
2026-08-15 ont échoué. Perdre le serveur aujourd'hui, c'est reconstruire de mémoire.

> Le plan tarifaire Vercel n'est **pas** mesuré depuis le dépôt. L'équipe s'appelle
> `thiambaras-projects`, le nom par défaut d'un compte Hobby — plan qui interdit l'usage commercial.
> C'est une déduction, pas une mesure, et la décision ne repose pas dessus.

## Décision

**Les fronts Next.js, les API Laravel, leurs workers et planificateurs, et leurs données tournent en
conteneurs sur le VPS Contabo existant (4 vCPU, 8 Go, 70 Go NVMe), déployés par Dokploy. Les images
se construisent dans GitHub Actions ; le serveur ne fait que les tirer.**

### 1. Dokploy, et non Coolify

Les deux font l'affaire. Dokploy consomme environ 600 Mo de moins, sur une machine de 8 Go qui porte
**quatre** environnements (deux projets × préproduction et production). Dokploy pose Traefik et un
Docker Swarm à un nœud, et expose une API REST (`compose.deploy`, `application.deploy`) qu'un workflow
peut appeler.

### 2. Le serveur ne construit rien

Le vCPU Contabo est partagé. Un `next build` sature le processeur plusieurs minutes : construire sur
le serveur ralentirait les API à chaque déploiement, production comprise. Les images se construisent
donc dans GitHub Actions, se poussent sur GHCR, et Dokploy les tire.

**Conséquence directe : pas de previews par pull request.** Celles de Dokploy construisent *sur le
serveur*, et sa documentation les déconseille sur un dépôt public — `thiambara/takussan` l'est.
Chaque projet a **une** préproduction stable, alimentée par la branche `preview`, comme l'API
l'était déjà.

### 3. Une image d'API par commit, une image de front par environnement

L'image d'API ne porte aucun environnement : toute sa configuration arrive par l'environnement du
conteneur, au démarrage. La même image sert la préproduction et la production.

Le front ne le peut pas : `NEXT_PUBLIC_*` est **inliné à la compilation**
(`docs/infra/frontend-deploiement.md`). Une image de front ne sert donc qu'un environnement, et son
Dockerfile **refuse de construire** sans `NEXT_PUBLIC_API_URL` et `NEXT_PUBLIC_SITE_URL`.

Ce refus porte hors de Vercel la protection d'[ADR-0026](0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md).
`resoudreOrigineSite()` échoue bruyamment sur une preview sans origine connue — mais elle reconnaît
une preview **à `VERCEL_ENV`**, qui n'existe plus hors de Vercel. Sans `NEXT_PUBLIC_SITE_URL`, une
préproduction auto-hébergée retomberait en silence sur `ORIGINE_PRODUCTION` et déclarerait ses pages
canoniques en production. Le Dockerfile ferme ce cas avant le premier octet compilé.

### 4. PHP est servi par FrankenPHP, en mode classique

FrankenPHP remplace nginx + php-fpm + les unités systemd + le cron : un seul processus par conteneur.

**Mode classique, pas worker ni Octane.** Le mode classique démarre Laravel à chaque requête, comme
php-fpm. Le mode worker garde l'application en mémoire entre les requêtes, et ce code n'a jamais été
audité pour ça (singletons, état statique, `request()` capturé dans des services). Passer en mode
worker demandera son propre ADR, sur une mesure de gain.

### 5. Une pile d'API est un Compose ; un front est une Application

- **La pile d'API d'un environnement est un service Compose de Dokploy**, dont le fichier est
  versionné : `deploy/takussan/compose.api.yml`. Un conteneur `release` à usage unique joue les
  migrations, la réconciliation des rôles et la synchronisation Meilisearch ; `api`, `worker`,
  `worker-media` et `scheduler` ne démarrent qu'**après son succès**. Tous partagent un volume nommé
  pour `storage/app`, dont les médias.
- **Le front est une Application Dokploy** construite depuis une image, mise à jour par Swarm sans
  coupure, derrière une sonde de santé.
- Les files consommées sont **écrites dans le fichier Compose**, et c'est lui que
  `scripts/check-queues.mjs` lit désormais. La troisième copie de la liste — `FILES_ATTENDUES` de
  `deploy.sh`, comparée aux unités systemd réelles — n'a plus d'objet : le fichier gardé *est* le
  déploiement.

### 6. Les données

| Service | Forme | Pourquoi |
|---|---|---|
| PostgreSQL 17, image `pgvector/pgvector:pg17` (ADR-0020) | service **Database** de Dokploy | sauvegarde vers S3 et restauration intégrées |
| MySQL 8.4 (CheckPrint Plus) | service **Database** de Dokploy | idem. **8.4 et non 8.0** : la branche 8.0 est en fin de vie depuis avril 2026 |
| Redis (un par projet), Meilisearch v1.16 | Compose **versionné**, `deploy/server/compose.data.yml` | se reconstruisent : l'index depuis la base, le cache par définition |

- **Une instance par moteur, une base et un rôle par environnement.** Chaque base se crée avec
  `ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0` — la collation déterministe d'ADR-0020 se
  **déclare** à la création, elle ne s'hérite pas de l'instance. `REVOKE CONNECT … FROM PUBLIC` :
  le rôle de préproduction ne se connecte pas à la base de production.
- **Meilisearch reste partagé entre préproduction et production, séparé par `SCOUT_PREFIX`**, comme
  aujourd'hui. On y ajoute ce qui manquait : **une clé d'API par environnement, restreinte à ses
  index** (`preview_*`, `prod_*`), au lieu de la clé maîtresse des deux côtés.

### 7. Une sauvegarde se restaure avant d'être comptée

Chaque base est sauvegardée chaque nuit vers Cloudflare R2, et les volumes de médias chaque jour.
**Une restauration complète à blanc, mesurée** — les comptes de lignes de la copie comparés à
l'original — conditionne la mise en production. *Une sauvegarde jamais restaurée n'est pas une
sauvegarde : c'est une hypothèse.*

### 8. Cloudflare devant, sauf pour les hôtes de second niveau

Les deux domaines sont déjà chez Cloudflare. Les hôtes de premier niveau (apex, `www`, `api`,
`preview`) passent par le proxy. **`preview.api.*` reste en DNS seul** : le certificat Universal
SSL gratuit ne couvre que l'apex et **un** niveau de sous-domaine (`*.takussan.com`), si bien qu'un
`preview.api.takussan.com` proxifié échouerait à la poignée de main TLS, en bordure.

Le TLS d'origine est émis par Let's Encrypt via Traefik ; Cloudflare est réglé en **Full (strict)**,
avec « Always Use HTTPS » **désactivé** (la redirection est faite par Traefik). Ainsi le défi HTTP-01
traverse le proxy, et le certificat se renouvelle sans intervention.

**L'IP du client se reconstruit des deux côtés.** Traefik ne fait confiance aux en-têtes
`X-Forwarded-*` que depuis les plages Cloudflare. Laravel reçoit dans `TRUSTED_PROXIES` le réseau
Docker **et** ces mêmes plages. Sans la première règle, Laravel voit l'IP d'une bordure Cloudflare ;
sans la seconde aussi. Or les listes d'IP des webhooks **refusent tout en cas de doute** (D-49),
et les limites de débit sont indexées sur `Request::ip()`. Ce point se prouve par une ablation, pas
par une relecture (plan, phases D et F).

**Et le serveur PHP ne fait confiance à personne.** Le `trusted_proxies` de Caddy retiendrait comme
adresse du client l'IP la plus à **gauche** de `X-Forwarded-For` : celle que le client écrit
lui-même, et que Cloudflare conserve en y ajoutant la vraie. Un en-tête forgé portant l'IP d'un
opérateur SMS franchirait alors la liste d'IP des webhooks. `REMOTE_ADDR` reste donc l'adresse de
Traefik, et **seul Laravel** remonte la chaîne, de droite à gauche, en s'arrêtant au premier maillon
qu'il ne connaît pas. La preuve est une usurpation refusée (plan, D5).

### 9. Les noms d'hôte ne changent pas

L'application de bureau de CheckPrint Plus a l'URL de l'API **dans son code**
(`flutter_app/lib/core/config/env_config.dart:10-11`). Les URL de redirection OAuth, les webhooks
déclarés chez les opérateurs SMS, WhatsApp et LemonSqueezy, et les origines CORS sont écrits chez
des tiers. **La migration change des enregistrements DNS, jamais un nom.**

### 10. Le code servi se prouve

Chaque image porte le commit qui l'a produite (`BUILD_SHA`) et le renvoie dans l'en-tête
`X-Build-Sha`. Le workflow de déploiement **n'est vert que lorsque l'URL publique rend le commit
poussé**. *Un déploiement « réussi » qui ne mesure pas ce qui est servi ne dit rien* : c'est D-04
(deux échecs lus comme une absence) et ADR-0017 (un front en production que le dépôt croyait
inexistant).

## Conséquences

### Ce qui se règle

- **D-09** — les versions sont épinglées dans les Dockerfile et les fichiers Compose. La colonne
  « production » de `docs/infra/versions.json` devient **mesurable** : `docker exec … --version`, avec
  la date. Elle reste une **mesure**, jamais une citation de la configuration.
- **D-10 et ADR-0017** — le déploiement du front revient dans le dépôt.
- **TCK-288** perd son objet (compte MySQL, `server-setup.sh`) ; le plan le remplace. **TCK-333**
  (Vercel sans filtre de chemins) devient sans objet. **TCK-332** se ferme à la mise en production.
- **Le serveur se reconstruit** depuis le dépôt, plus un relevé de l'état Dokploy.

### Ce que ça coûte

- **Le porteur devient l'exploitant.** Mises à jour de sécurité, montées de version de Dokploy,
  disque, sauvegardes, renouvellements TLS : une partie de ce que Vercel faisait sans qu'on le voie.
- **Un point de défaillance unique pour quatre environnements.** Un disque plein arrête tout, et
  met la base de production en lecture seule. C'est **atténué, pas résolu** : limite mémoire par
  conteneur, 4 Go de swap, nettoyage Docker quotidien, rotation des journaux, surveillance externe.
- **Préproduction et production partagent la machine** — c'était déjà vrai (D-01 : les deux
  domaines pointent sur `178.18.247.62`). Un seed de préproduction peut ralentir la production.
  **Le premier geste de montée en charge** sera de sortir les préproductions, ou PostgreSQL, sur une
  autre machine — pas d'agrandir celle-ci.
- **Une partie de l'état vit hors du dépôt** : variables d'environnement, domaines et services de
  base configurés dans l'interface de Dokploy. Même réponse qu'ADR-0017 : un relevé,
  `docs/infra/hebergement.md`, avec les commandes qui le re-mesurent. Les **valeurs** des variables
  n'y figurent pas ; elles se gardent dans un gestionnaire de secrets, parce que perdre le serveur,
  c'est aussi perdre l'interface qui les porte.
- **Plus de preview par pull request.** Vercel en a produit 212. Une PR se vérifie en CI, puis sur la
  préproduction partagée une fois fusionnée dans `preview`.
- **Redéployer la pile d'API la coupe quelques secondes** : Compose recrée les conteneurs. Le front,
  lui, bascule sans coupure. Acceptable avant le lancement ; à mesurer, et à reprendre si besoin,
  avant la production.
- **La réindexation Meilisearch devient plus grossière.** `deploy.sh` comparait fichier par fichier
  avec la release précédente, présente sur le disque ; un conteneur n'en a pas. Désormais une
  empreinte de la « forme » des index est calculée au build et comparée à la dernière importée,
  gardée dans le volume : un changement réimporte **tous** les modèles indexés. Sur ~840 biens,
  c'est un coût acceptable ; il sera mesuré.
- **Les préproductions sont protégées par une authentification basique** (Traefik) au lieu du SSO
  de Vercel.
- **Les hôtes proxifiés héritent des limites de Cloudflare Free** : 100 s par requête, 100 Mo par
  envoi. Le « Bot Fight Mode » doit rester **désactivé** sur les zones qui portent une API : le plan
  gratuit ne permet pas d'en exempter un chemin, et il bloquerait les webhooks et le client de bureau.

### Ce que ça interdit

- **Construire une image sur le serveur**, que ce soit par `docker build` ou par la construction
  depuis Git de Dokploy.
- **Construire une image de front sans** `NEXT_PUBLIC_API_URL` et `NEXT_PUBLIC_SITE_URL`.
- **Publier le port d'une base de données** sur l'interface publique.
- **Renommer un hôte public** dans le cadre de cette migration.
- **Passer FrankenPHP en mode worker, ou adopter Octane,** sans ADR.

## Alternatives écartées

| Option | Pourquoi non |
|---|---|
| **Coolify** | Plus mûr et mieux documenté, mais ~600 Mo de plus sur une machine qui en a 8 pour quatre environnements. |
| **Garder Vercel pour les fronts** (plan Pro) | Le rendu serveur reste à Washington, à un océan de l'API — le point 2 du contexte ne se règle pas. Et on garde deux fournisseurs, deux modèles de déploiement. |
| **Netlify, Render, Railway** | Un troisième fournisseur, facturé par service ; l'API reste sur le VPS, le rendu serveur loin d'elle. |
| **Cloudflare Workers via OpenNext** | Le runtime Workers impose des contournements pour une partie de Node et de Next récent, et chaque appel à l'API part toujours d'une bordure vers l'Europe. |
| **Kamal, CapRover, ou Compose plus un script maison** | Pas de sauvegarde ni de restauration de base intégrées, une API de déclenchement à écrire soi-même : de la glue que Dokploy fournit. |
| **Garder nginx et php-fpm natifs, ne conteneuriser que le front** | Deux modèles de déploiement sur une machine ; D-09 reste ouvert ; le serveur ne se reconstruit toujours pas. |
| **Previews par PR de Dokploy** | Construction sur le serveur, déconseillée sur un dépôt public (point 2). |
| **PostgreSQL et MySQL dans le Compose versionné** | On gagnerait le versionnement, et on perdrait la sauvegarde vers S3 et la restauration intégrées — soit la partie qui protège les données. Le relevé compense. |
| **FrankenPHP en mode worker, ou Octane** | L'état fuit d'une requête à l'autre, et ce code n'a jamais été audité pour ça (point 4). |

## Application

- **Le plan** : [`docs/plans/2026-09-13-auto-hebergement-vps-dokploy.md`](../plans/2026-09-13-auto-hebergement-vps-dokploy.md)
  — pistes parallèles, runbook du serveur, fichiers, vérifications mesurées.
- **Les fichiers créés** : `takussan-api/Dockerfile` et `takussan-api/docker/`, `takussan-web/Dockerfile`,
  `deploy/takussan/compose.api.yml`, `deploy/server/compose.data.yml`, `deploy/server/bootstrap.sh`,
  `.github/workflows/images.yml`.
- **Les gardes** : `scripts/check-queues.mjs` lit le fichier Compose de l'API ;
  `scripts/check-front-env-keys.mjs` exige que toute `NEXT_PUBLIC_*` lue soit un `ARG` du Dockerfile
  du front ; la colonne « production » de `versions.json` se mesure dans les conteneurs.
- **Ce qui se retire** : `scripts/deploy.sh`, `scripts/server-setup.sh`, `scripts/seed-*.sh`,
  `.github/workflows/deploy.yml` et `deploy-preview.yml` dès la mise en service des préproductions ;
  `.github/workflows/front-deploy-map.yml`, `docs/infra/frontend-deploiement.{md,json}`, les deux
  projets Vercel et `@vercel/analytics` à la bascule de la production.
