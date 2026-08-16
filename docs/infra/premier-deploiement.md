# Premier déploiement — préproduction puis production

Marche à suivre pour la **première mise en production** de Takussan, mesurée le **2026-08-13**.

État de départ, vérifié à cette date :

| Fait | Mesure |
|---|---|
| `https://api.takussan.com/up` | **404** — la production n'a jamais servi l'application |
| `https://preview.api.takussan.com/up` | **200** — la préproduction tourne |
| `deploy.yml` (production) | **jamais exécuté** — `gh run list` ne rend aucun run |
| `deploy-preview.yml` | 5 exécutions, toutes vertes, la dernière le 2026-06-20 |
| `origin/preview` vs `origin/dev` | `2 54` — 2 commits de merge, **aucun contenu propre** |
| `origin/master` vs `origin/dev` | `0 78` — rattrapage strict |

---

## Trois choses à savoir avant de commencer

### 1. `server-setup.sh` réécrit les vhosts nginx — et peut décrocher la préproduction du TLS

`setup_nginx_vhost()` écrit le fichier avec `cat > "${vhost_file}"`, sans lire ce qui s'y trouvait,
puis `systemctl reload nginx`. Le bloc `server { listen 443 ... }` que `certbot --nginx` a ajouté
dans ce même fichier lors de la mise en place de la préproduction **disparaît**. Le vhost écrit est
volontairement HTTP seul — son propre commentaire le dit : *« Certbot --nginx will add the 443
server block ».*

`preview.api.takussan.com` répond aujourd'hui en HTTPS. Lancer le script sans précaution la fait
retomber en HTTP, sur un environnement qui marchait.

**Parade** : sauvegarder `/etc/nginx/sites-available/` avant, et repasser `certbot --nginx` après.
Certbot réinstalle le bloc TLS depuis le certificat déjà émis — aucune nouvelle émission, donc
aucun risque de toucher aux quotas Let's Encrypt.

### 2. Le secret `ENV_FILE` de production date du 2026-05-19

`deploy.sh` **écrase** `/var/www/takussan/shared/.env` avec le contenu du secret à chaque
déploiement :

```sh
if [ -n "${ENV_FILE:-}" ]; then
    echo "${ENV_FILE}" > "${SHARED_DIR}/.env"
```

Ce secret est donc la source de vérité, et il est antérieur à **TCK-280** (juin), qui a rendu
Meilisearch obligatoire sur tous les environnements. S'il ne porte pas `SCOUT_DRIVER=meilisearch`,
`MEILISEARCH_HOST`, `MEILISEARCH_KEY` et un `SCOUT_PREFIX` distinct de celui de la préproduction,
la production démarrera avec la mauvaise configuration de recherche — et, pire, un `SCOUT_PREFIX`
identique ferait écrire les deux environnements dans **les mêmes index Meilisearch**.

Le secret ne se lit pas depuis GitHub. Il se vérifie par ses **clés**, comparées à `.env.example`
(70 clés), à l'étape 2 ci-dessous.

### 3. Déployer `dev` sur la préproduction passe **obligatoirement** par le merge

`deploy-preview.yml` n'a **aucune entrée** de `workflow_dispatch`, et son `checkout` est codé en
dur :

```yaml
ref: ${{ github.event_name == 'workflow_dispatch' && 'preview' || github.sha }}
```

Un dispatch déploie donc toujours la branche `preview`, quoi qu'on lance. Pour la préproduction,
**le merge EST le déploiement** : pousser sur `preview` déclenche le workflow (les chemins
`takussan-api/**` sont touchés). L'ordre « déployer puis merger » ne s'applique qu'à la production,
dont le workflow accepte `branch: dev`.

Et symétriquement : **merger la PR #151 (`dev` → `master`) déclenchera un second déploiement de
production, automatiquement** — `deploy.yml` écoute `push` sur `master`, et la confirmation typée
ne couvre que `workflow_dispatch`. C'est voulu ici, puisqu'on aura déjà déployé le même arbre à la
main ; il faut simplement le savoir.

---

## Étape 0 — Préparer le serveur (une seule fois, en root)

`server-setup.sh` est **manuel** : aucun workflow ne le lance. Il pose les quatre unités systemd
de file — deux workers par application, qui ne partagent aucune file — et `deploy.sh` ne fait
qu'un `queue:restart` : il ne réécrit jamais une unité.

```sh
# Depuis le poste, dans le dépôt, sur dev à jour
scp scripts/server-setup.sh "${CONTABO_USER}@${CONTABO_HOST}:/tmp/server-setup.sh"
ssh "${CONTABO_USER}@${CONTABO_HOST}"

# Sur le serveur — LA SAUVEGARDE D'ABORD (cf. hasard n°1)
sudo cp -a /etc/nginx/sites-available /root/nginx-sites-available.$(date +%F)
sudo ls -l /etc/letsencrypt/live/            # quels certificats existent déjà

sudo bash /tmp/server-setup.sh
```

Le script se termine par un `=== Validation summary ===` de ~20 lignes `PASS`/`FAIL`. **Lire les
`FAIL`** : ils nomment ce qui manque (pool php-fpm, socket, vhost, unité désactivée, cron du
scheduler, sudoers, `known_hosts`).

Puis remettre le TLS en place :

```sh
sudo certbot --nginx -d api.takussan.com -d preview.api.takussan.com
sudo nginx -t && sudo systemctl reload nginx

curl -s -o /dev/null -w '%{http_code}\n' https://preview.api.takussan.com/up   # attendu : 200
```

Si la préproduction ne rend plus 200 en HTTPS, restaurer le vhost sauvegardé avant d'aller plus
loin — c'est le seul environnement qui marche.

## Étape 1 — Vérifier ce que la production attend

Toujours sur le serveur :

```sh
# La base existe-t-elle, et sur quel moteur ? MESURÉ le 2026-08-13 :
#   mysql-server 8.0.46-0ubuntu0.24.04.3 · utf8mb4_0900_ai_ci · utf8mb4
# (le client s'appelle `mysql`, pas `mariadb` — le serveur tourne sur MySQL 8, cf. TCK-289)
sudo mysql -e "SELECT VERSION(), @@collation_server, @@character_set_server;"
sudo mysql -e "SHOW DATABASES;" | grep -i takussan

# Les répertoires que deploy.sh exige, sinon il sort en FATAL avant le clone
ls -ld /var/www/takussan/shared /var/www/takussan/shared/storage
```

`deploy.sh` s'arrête net, avant tout clone, si `shared/` ou `shared/storage/` manque, ou si le
`.env` écrit n'a pas d'`APP_KEY=base64:…`.

## Étape 2 — Vérifier les clés du secret `ENV_FILE`

Le secret n'est pas lisible ; on compare ce qu'il **devrait** contenir à ce que la préproduction
utilise réellement.

```sh
# Sur le poste : les clés attendues
grep -oE '^[A-Z][A-Z0-9_]*' takussan-api/.env.example | sort > /tmp/attendues.txt

# Sur le serveur : les clés de la préproduction, qui tourne
sudo grep -oE '^[A-Z][A-Z0-9_]*' /var/www/takussan-preview/shared/.env | sort > /tmp/preview.txt
comm -23 /tmp/attendues.txt /tmp/preview.txt   # présentes dans l'exemple, absentes de preview
```

Puis, dans le secret `ENV_FILE` de production, s'assurer au minimum de :

```
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:…                 # obligatoire — deploy.sh refuse de démarrer sans
DB_CONNECTION=mysql              # .env.example livre sqlite : il n'est PAS un modèle de prod
SCOUT_DRIVER=meilisearch         # TCK-280
MEILISEARCH_HOST=http://127.0.0.1:7700
MEILISEARCH_KEY=…                # LA MÊME que preview : une seule instance sert les deux
                                 # (`sudo grep -i master_key /etc/meilisearch.toml`)
# SCOUT_PREFIX                   # PAS de préfixe en production — c'est la convention de
                                 # docs/configuration.md : preview porte `preview_`, la prod
                                 # rien. Seule la DIFFÉRENCE compte, mais deux préfixes
                                 # identiques feraient écrire les deux environnements dans
                                 # les mêmes index, et un scout:import écraserait l'autre.
QUEUE_CONNECTION=database
```

Mise à jour du secret si nécessaire :

```sh
gh secret set ENV_FILE < /chemin/vers/.env.production
```

## Étape 3 — Déployer `dev` sur la préproduction

Le merge est le déploiement (cf. hasard n°3). `preview` porte 2 commits de merge et **aucun
contenu propre** — `git diff origin/dev...origin/preview` est vide — donc la fusion est sans
conflit.

```sh
gh pr create --base preview --head dev \
  --title "chore: rattraper preview sur dev" \
  --body "Rattrapage de preview sur dev avant la première mise en production."

gh pr merge <numéro> --merge
gh run watch --exit-status   # deploy-preview.yml part tout seul sur le push
```

Le workflow finit par son propre smoke test (`curl -fsS https://preview.api.takussan.com/up`).
Ensuite, sur le serveur :

```sh
cd /var/www/takussan-preview/current && php artisan scout:import   # une fois, après le 1er déploiement
systemctl is-active takussan-queue-preview takussan-queue-preview-media
```

Vérifier enfin dans le journal du déploiement qu'aucun `WARNING: aucune unité systemd active ne
consomme la file '…'` n'apparaît : `deploy.sh` lit les **unités réelles** et n'échoue pas
là-dessus — il se contente de le dire.

## Étape 4 — Déployer `dev` en production, à la main

C'est le geste pour lequel l'entrée `branch` existe.

```sh
gh workflow run deploy.yml -f branch=dev -f confirmer=dev
gh run watch --exit-status
```

Le champ `confirmer` doit être **retapé à l'identique** ; c'est la seule barrière entre « accepter
un formulaire pré-rempli » et `php artisan migrate --force` sur la base de production.

Vérifications :

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://api.takussan.com/up      # attendu : 200

# sur le serveur
cd /var/www/takussan/current && php artisan scout:import
systemctl is-active takussan-queue takussan-queue-media
tail -50 /var/log/takussan-deploy.log
```

**Si le déploiement échoue**, `deploy.sh` a un `trap rollback ERR` : il restaure le lien
symbolique vers la release précédente et supprime la release fautive. Au **premier** déploiement
il n'y a pas de release précédente — le rollback se réduit donc à supprimer la release ratée, et
`/up` restera en 404. Cas particulier à connaître : si les migrations passent mais qu'une étape
ultérieure échoue, **le schéma reste migré** pendant que le code revient en arrière.

## Étape 5 — Merger `dev` sur `master`

PR **#151** déjà ouverte : https://github.com/thiambara/takussan/pull/151

```sh
gh pr merge 151 --merge
```

Le push sur `master` **relance `deploy.yml` automatiquement**, sans confirmation. À ce stade c'est
le même arbre que celui déployé à l'étape 4, donc un redéploiement sans surprise — et une
vérification de plus du chemin par push, qui n'a jamais tourné non plus.

## Étape 6 — Trancher la politique de branche (TCK-288)

Une fois la production servie et vérifiée, la question posée par TCK-288 se pose enfin sur des
faits : garder `push: master` comme déclencheur de production, ou n'y laisser que le
`workflow_dispatch` et sa confirmation typée. Le choix se prend **après** ce premier déploiement,
pas avant — c'est ce que dit l'en-tête de `deploy.yml`.

---

## Ce qui reste ouvert et ne bloque pas

- **TCK-284** — les endpoints derrière `/app/*` n'ont pas de garde `kind` : un `curl` passe. La
  garde `check-pro-routes` l'imprime à chaque exécution.
- **TCK-289** — ✅ **soldé le 2026-08-13**. Le serveur tourne sur **MySQL 8.0.46**,
  `utf8mb4_0900_ai_ci` — pas sur MariaDB, contrairement à ce que le compose et la CI supposaient.
  Corrigé partout, et gardé par `scripts/check-db-engine.mjs`. Reste ouvert : `server-setup.sh`
  ne pose toujours pas le moteur (délibéré — cf. le ticket).
- **TCK-290** — upload du logo d'agence : 403 systématique, aucune `AgencyPolicy`. Aucun test ne
  couvre ce chemin.
