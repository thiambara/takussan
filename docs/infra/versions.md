# Versions d'infrastructure — ce que chaque environnement exécute

**Source de vérité : [`versions.json`](versions.json).** Ce document explique le *pourquoi* et donne
les commandes ; il ne recopie aucune valeur, parce qu'une valeur écrite à deux endroits diverge.

```bash
node scripts/check-infra-versions.mjs --report   # le tableau dev / CI / prod, et ce qui l'a produit
```

---

## Ce que ce fichier existe pour corriger

Mesuré le 2026-08-16 (TCK-298) : **développement et CI sont épinglés des deux côtés ; la production
ne l'est nulle part dans le dépôt.**

`scripts/server-setup.sh`, le seul script de provisionnement, **n'installe rien**. Il lit `php -v`,
vérifie que `/etc/php/<version>/fpm/pool.d` et `/etc/nginx/sites-available` existent, et si ce n'est
pas le cas il **imprime la commande à lancer à la main** avant de passer à la suite. Le seul document
qui nomme une installation est un guide — `deploy-preview.html` §6.4, `sudo apt install meilisearch`
— sans version, et personne ne peut dire quand il a été joué ni ce qu'`apt` a posé ce jour-là.

Ce n'est pas une hypothèse sur ce qui *pourrait* mal tourner : c'est **exactement** la mécanique de
l'ardoise **D-43**. `docker-compose.yml` et le job `migrations-mysql` ont tourné sur `mariadb:11.4`
parce qu'un commentaire affirmait que c'était « ce qu'`apt install mariadb-server` pose sur le
serveur ». Personne n'avait lancé cette commande. Le serveur servait **MySQL 8.0.46**, avec une autre
collation. Pas un écart de version : **le mauvais moteur**, et un banc d'essai qui validait du DDL
que la production n'exécuterait jamais — en annonçant l'inverse à chaque exécution.

> **Ne jamais déduire l'état d'un environnement de la configuration — ni de la commande
> d'installation — qui le vise.** Un guide dit ce qu'on *voudrait* poser. `deploy.yml` dit ce qui
> *devrait* se produire. Seule la machine dit ce qui *est*.

---

## Les deux états d'une ligne « production », et pourquoi il n'y en a pas trois

| `etat` | Ce que ça veut dire | Ce que le catalogue exige |
|---|---|---|
| `mesure` | La commande a été lancée **sur la machine**, et sa sortie est recopiée. | `valeur`, `commande`, `date` (AAAA-MM-JJ), `source` |
| `non_mesure` | Personne n'a lancé la commande. On l'écrit, et on écrit **laquelle lancer**. | `valeur: null`, `commande`, `pourquoi` |

Il n'existe pas d'état « probable », « supposé » ni « d'après le guide ». Une version qu'on croit
tenir sans l'avoir relevée est une version fausse qui n'a pas encore coûté — et la garde refuse
`etat: non_mesure` accompagné d'une valeur, précisément pour empêcher qu'on « comble » le tableau.

**Un `non_mesure` n'est pas un échec de ce ticket, c'est son livrable.** Le dépôt ne pouvait pas dire
ce qu'il ignorait ; il le dit maintenant, avec la commande qui y remédie. La confrontation avec la
machine appartient à **TCK-288**.

---

## Mesurer la production

Aucune de ces commandes n'écrit quoi que ce soit. Depuis un poste ayant l'accès SSH `deploy@` :

```bash
ssh deploy@<serveur> '
  mysql --version
  /usr/bin/meilisearch --version
  redis-server --version   || echo "redis: absent"
  php -v | head -1
  cat /etc/takussan/php-version   # écrit par server-setup.sh au moment où il a lu php -v
  node --version           || echo "node: absent"
  command -v mailpit       || echo "mailpit: absent"
'
```

Pour MySQL, la mesure de référence reste celle que porte `scripts/check-db-engine.mjs` — elle relève
aussi la collation, qui compte autant que la version :

```bash
sudo mysql -e "SELECT VERSION(), @@collation_server, @@character_set_server;"
```

**Après avoir mesuré**, dans `versions.json` : passer `etat` à `mesure`, écrire `valeur`, `date`
(le jour du relevé, pas celui de l'écriture) et `source` (ticket ou entrée d'ardoise), puis

```bash
node scripts/check-infra-versions.mjs --report
```

Une valeur relevée il y a six mois n'est plus une mesure de l'état courant : c'est une mesure datée.
La `date` est là pour qu'on puisse en juger, pas pour la décoration.

---

## Ce que la garde vérifie

`scripts/check-infra-versions.mjs`, rejoué par **Repo CI**, tient cinq propriétés :

1. **Le catalogue et le dépôt disent la même chose.** Chaque valeur `dev`/`ci` est une citation :
   la garde la retrouve, à l'identique, dans le fichier qui la déclare.
2. **Rien n'échappe au catalogue.** Toute image de conteneur, tout `php-version:`/`node-version:`
   trouvé dans `docker-compose.yml` ou dans **n'importe quel** workflow doit se rattacher à un
   service catalogué. Ajouter un service sans l'y inscrire fait rougir.
3. **Une déclaration ne disparaît pas en silence.** Un service dont le catalogue annonce une valeur
   pour un environnement doit y être trouvé au moins une fois.
4. **L'aveu d'ignorance est obligatoire et outillé** — les deux états ci-dessus, et rien d'autre.
5. **Les valeurs partagées avec une autre garde restent d'accord** (`accords_croises`), sur le texte
   *hors commentaires*.

Le périmètre CI est obtenu en **listant `.github/workflows/`**, jamais en énumérant les fichiers :
une garde dont le périmètre est une liste écrite cesse de couvrir le fichier qu'on ajoute.

### Prouvée par mutation

Une garde qu'on n'a pas vue rougir ne garde rien. Les sept mutations jouées avant de la câbler :

| Mutation | Attendu | Obtenu |
|---|---|---|
| `docker-compose.yml` : Meilisearch `v1.16` → `v1.15` | rouge, nomme le service et les deux valeurs | ✅ `docker-compose.yml:117 — meilisearch en DEV vaut v1.15 ; … déclare v1.16` |
| `api-ci.yml` : `php-version` `8.4` → `8.3` | rouge, **deux fois** (deux jobs) | ✅ lignes 40 et 190 |
| `docker-compose.yml` : ligne `image: redis:8-alpine` **supprimée** | rouge — c'est le trou par lequel `check-db-engine` était passé | ✅ `redis.dev — … AUCUNE déclaration n'a été trouvée` |
| Nouveau service `rabbitmq:4-management` ajouté au compose | rouge — un service hors catalogue | ✅ `image rabbitmq:4-management … ABSENTE de docs/infra/versions.json` |
| `meilisearch.prod` : `valeur` remplie tout en restant `non_mesure` | rouge — c'est le geste que le ticket interdit | ✅ `… mais valeur vaut "v1.16". Une version non mesurée n'est pas une version : c'est une supposition.` |
| `redis.dev` nullé **sans** `absence` | rouge — sinon supprimer une version rend la garde muette | ✅ `valeur: null sans absence` |
| `check-db-engine.mjs` : `PROD.version` → `8.0.47-…`, catalogue inchangé | rouge — les deux gardes doivent porter la même mesure | ⚠️ **verte d'abord**, cf. ci-dessous |

La dernière mutation est la plus instructive, et elle a **trouvé un défaut réel dans la garde**.
L'accord croisé cherchait le littéral dans le fichier *entier* — or `8.0.46-0ubuntu0.24.04.3` survit
**trois fois** dans le docblock de `check-db-engine.mjs`, qui raconte la mesure (`ii mysql-server
8.0.46-…`). La garde lisait donc la *mémoire* du défaut et la prenait pour la déclaration. Corrigé :
l'accord croisé s'évalue hors commentaires, et la mutation rougit.

*Un accord croisé qui accepte une correspondance en commentaire n'accorde rien : il constate que les
deux fichiers se souviennent de la même chose, pas qu'ils déclarent la même chose.*

---

## Ce que ce dispositif ne fait pas

- **Il ne mesure pas la production.** Il ne s'y connecte jamais, et n'a aucun secret pour le faire.
  Il rend le dépôt capable de *dire* ce qu'il sait et ce qu'il ignore. Confronter le catalogue à la
  machine, c'est **TCK-288**.
- **Il n'épingle rien sur le serveur.** Pas d'`apt-mark hold`, pas d'image. Un `apt upgrade` peut
  changer une version demain ; la garde ne le verra pas — elle verra seulement que la ligne
  `mesure` a vieilli, si quelqu'un lit sa `date`.
- **Il ne couvre pas ce qui n'est ni une image, ni une clé `*-version`, ni la plateforme composer** —
  nginx, certbot, systemd, le noyau. Ajouter une sonde est peu coûteux ; prétendre que le tableau
  est complet le serait beaucoup plus.
