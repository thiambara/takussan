---
id: TCK-288
title: "Premiere mise en production — la chaine n'a jamais tourne"
status: todo
phase: P0
family: technique
estimate: M
wave: null
created: 2026-08-12
updated: 2026-08-24
depends_on: [TCK-296, TCK-299, TCK-300, TCK-332, TCK-352, TCK-355]
blocks: []
spec_refs:
  features: []
  models: []
tags: [infra, deploiement, decision]
---

## Objectif utilisateur

Que `api.takussan.com` serve l'application — et que la branche qui la déploie soit écrite quelque
part.

## Ce que la mesure a établi (2026-08-12)

> **Le diagnostic d'origine de ce ticket était faux, et il faut le dire.** Il annonçait *« la
> production ne reçoit plus rien depuis trois mois »*, ce qui suppose qu'elle en recevait.
> **Elle n'en a jamais reçu.** Un audit qui se re-mesure change de conclusion ; celui-ci l'a fait.

| Fait | Mesure |
|---|---|
| `deploy.yml` a-t-il déjà tourné ? | **Jamais.** `gh run list` ne rend aucun run. Le seul workflow de déploiement exécuté est *Deploy Laravel API (Preview)* — **5 fois**, sur `preview`, dernier le 2026-06-20. |
| `https://api.takussan.com/up` | **404** |
| `https://preview.api.takussan.com/up` | **200** |
| Même serveur ? | **Oui** — `178.18.247.62` pour les deux domaines. |
| `master` porte-t-il la chaîne de déploiement ? | **Non.** `deploy.yml`, `deploy-preview.yml`, `deploy.sh` et `server-setup.sh` **n'existent pas** sur `master` : la branche précède le commit `14246ce6` qui les a créés. |
| `origin/dev..origin/master` | **0 commit.** `master` est un ancêtre strict de `dev` — un merge serait un simple *fast-forward*, sans conflit possible. |
| Secrets requis par `deploy.yml` | **Les 5 existent**, dont `ENV_FILE` (le `.env` de production), posés le 2026-05-19. |
| PHP du serveur | **≥ 8.4.1**, prouvé : le déploiement preview du 2026-06-20 a réussi alors que `deploy.sh` lance `composer install --no-dev` et que le lock d'alors exigeait `php >=8.4.1` sur 17 paquets. |

**Ce n'est donc pas une chaîne cassée à réparer. C'est une première mise en production à faire.**

Et le risque n'est pas celui qu'on croyait : ce n'est pas le merge (trivial), c'est que **le
workflow de production n'a jamais été exercé**. Son jumeau de preview l'a été cinq fois sur la même
machine, ce qui est rassurant sans être une preuve — ils diffèrent par la cible, le `.env` et le
répertoire.

## Ce que le déploiement embarquerait

**31 commits**, dont : la recherche Meilisearch (TCK-280), le canal WhatsApp sortant (TCK-282/283),
la refonte RBAC (`33ce4f69` est déjà sur `master`, mais pas les correctifs qui ont suivi), un
**lot de durcissement sécurité** (`5249e12a`), et toute la chaîne de déploiement elle-même.

**3 migrations neuves**, toutes additives :

- `2026_06_17_100000_create_whatsapp_contacts_table`
- `2026_06_17_110000_add_meta_columns_to_notification_templates`
- `2026_06_18_000001_add_performance_indexes_to_transactional_tables`

Aucun `drop`, aucun renommage. Le risque de perte de données est nul ; le risque de verrouillage
sur l'index de performance existe si les tables sont volumineuses — sur une base **jamais mise en
production**, elles ne le sont pas.

> ⚠️ **Il n'existe aucun chemin de rollback de SCHÉMA** au-delà du cutover RBAC (cf. D-05bis).
> `deploy.sh` restaure le code par bascule de symlink, jamais la base. Le dump préalable est la
> seule marche arrière — et sur une première mise en production, la base de destination est
> probablement vide, ce qui rend le point théorique ici mais pas au déploiement suivant.

## ⛔ Le blocage qui conditionne tout — mesuré le 2026-08-12

**Le déclenchement manuel est IMPOSSIBLE en l'état.** GitHub le dit lui-même :

```
$ gh workflow view deploy.yml
HTTP 404: workflow deploy.yml not found on the default branch
```

Enchaînement des faits :

1. La **branche par défaut du dépôt est `master`** (`gh repo view`).
2. `deploy.yml` **n'existe pas sur `master`** — la branche précède le commit qui l'a créé.
3. GitHub n'expose `workflow_dispatch` que pour les workflows présents sur la **branche par
   défaut**. `gh workflow list` ne voit donc que trois workflows, et le déploiement de production
   n'en fait pas partie.

**C'est circulaire** : pousser `deploy.yml` sur `master` pour le rendre déclenchable à la main
**déclencherait le déploiement automatique** — son filtre `paths:` inclut
`.github/workflows/deploy.yml`. On ne peut donc pas obtenir le manuel sans subir l'automatique.

**Ce qui dénoue** : faire de `dev` la branche par défaut. `deploy.yml` y existe, il devient
dispatchable, et **rien ne se déclenche** — son `on: push:` reste sur `master`. C'est un réglage de
dépôt, réversible d'un clic, et il ne fait que **rattraper la réalité** : les PR ciblent `dev`
depuis des mois.

### Séquence exacte pour l'option C

L'ordre compte, et une étape omise déploierait l'état du 2026-05-18 :

1. **Pousser la branche `chore/reprise-outillage-ia-docker` et la merger dans `dev`.** Sans ça,
   `deploy.yml` sur `dev` n'a pas l'entrée `branch` et un dispatch retomberait sur le `master`
   codé en dur.
2. **Basculer la branche par défaut du dépôt sur `dev`** (Settings → Branches). Ne déclenche rien.
3. `gh workflow run deploy.yml -f branch=dev` — **première exécution du déploiement de production**.
4. Vérifier : `curl -fsS https://api.takussan.com/up` → 200, puis `migrate:status` sur le serveur
   (les 3 migrations neuves).
5. **Peupler les index Meilisearch** — `deploy.sh` ne le fait PAS (Step 6b ne lance que
   `scout:sync-index-settings`). Sur une première mise en production, les **sept** index sont créés,
   correctement paramétrés, et **vides** : la recherche rendrait zéro résultat *sans lever la moindre
   exception*. Sur le serveur, dans le répertoire de la release :

   ```bash
   php artisan scout:import "App\Models\Property"
   php artisan scout:import "App\Models\Document"
   php artisan scout:import "App\Models\Message"
   php artisan scout:import "App\Models\Customer"           # TCK-281
   php artisan scout:import "App\Models\MaintenanceRequest"  # TCK-281
   php artisan scout:import "App\Models\Agency"              # TCK-281
   php artisan scout:import "App\Models\User"                # TCK-281
   ```

   Puis vérifier que chaque index n'est pas vide :
   `curl -H "Authorization: Bearer $MEILISEARCH_KEY" http://127.0.0.1:7700/indexes/<uid>/stats`.

   *(Détail dans `docs/configuration.md §3.6`. L'automatisation dort sur la branche non mergée
   `chore/deploy-meilisearch-reindex` — tant qu'elle n'est pas mergée, cette étape est manuelle et
   ne se rattrape pas toute seule.)*
6. **Seulement alors**, trancher entre A et B, avec un déploiement réussi comme preuve.

### Résidu à nettoyer

`deploy-api-preprod.yml` est enregistré **actif** chez GitHub (id `279002336`, créé le 2026-05-18)
alors qu'il **n'existe sur aucune branche** — `dev`, `preview` et `master` l'ignorent tous. Ses deux
seuls runs ont **échoué** (18 et 19 mai). C'est l'enregistrement résiduel d'un workflow supprimé :
inoffensif, mais il encombre `gh workflow list` et fait croire à un quatrième pipeline.

## ✅ L'échec du 2026-08-15 est élucidé — mesuré le 2026-08-24, sur le serveur

CLAUDE.md posait trois hypothèses et interdisait de deviner laquelle : *« secret périmé, compte
absent, grant manquant : les trois se ressemblent ici »*. La connexion au serveur tranche : **c'est
le nom du compte dans le secret, et l'écart tient en un caractère.**

```
$ grep DB_USERNAME /var/www/takussan/shared/.env
DB_USERNAME=takussan_prod                       ← 13 caractères

$ mysql -N -e 'SELECT user, LENGTH(user) FROM mysql.user WHERE user LIKE "takussan%";'
takussan_pre    12
takussan_pro    12                              ← le compte qui existe

$ mysql -N -e 'SHOW GRANTS FOR "takussan_pro"@"localhost";'
GRANT ALL PRIVILEGES ON `takussan_prod`.* TO `takussan_pro`@`localhost`
```

La base `takussan_prod` **existe** (vide, 0 table) et les droits sont posés — mais au nom d'un compte
que le `.env` n'écrit pas. D'où `Access denied for user 'takussan_prod'@'localhost'`.

**Aucune des trois hypothèses n'était fausse au sens strict** : le compte nommé par le secret était
bien absent. Ce que la mesure ajoute, c'est qu'il n'a jamais existé — il n'y a rien à restaurer, il y
a un nom à corriger d'un côté ou de l'autre.

> *Deux identifiants qui diffèrent d'un caractère et se ressemblent à l'œil ne se vérifient pas en
> les lisant.* `LENGTH()` a tranché en une commande ce qu'aucune relecture n'avait attrapé en huit
> jours.

### Ce que cette mesure change pour la suite du ticket

- **Le moteur a changé depuis** : ADR-0020 a fait passer le dépôt à PostgreSQL 17, et la
  préproduction y tourne depuis le 2026-08-24. Le compte MySQL `takussan_pro` n'a donc plus d'objet.
  Ce qu'il faut créer côté production est un **rôle PostgreSQL**, et une base en
  `--encoding=UTF8 --locale=C` — la manœuvre exacte, éprouvée sur la préproduction le 2026-08-24,
  est celle du runbook `docs/infra/premier-deploiement.md` §1.
- **Le serveur est prêt** : PostgreSQL 17.11 et `pgvector` 0.8.6 y sont installés, et `pdo_pgsql` est
  présent depuis la même date (ce qui a imposé de monter PHP de 8.4.18 à 8.4.24, le PPA ne livrant
  plus la 8.4.18). Il ne reste que le rôle, la base, et le `.env` de production.
- **Le `.env` de production déclare encore `DB_CONNECTION=mysql`** — à corriger dans le secret
  `ENV_FILE`, pas sur le serveur : `deploy.sh` réécrit `shared/.env` depuis le secret à chaque
  déploiement.
- **La leçon de nommage se reporte telle quelle.** Le rôle PostgreSQL et la valeur de `DB_USERNAME`
  doivent être copiés-collés depuis la même source, jamais retapés.

### Résidu supplémentaire, mesuré le 2026-08-24

`/var/www/takussan/current` est un lien symbolique **qui pointe sur lui-même**, et
`/var/www/takussan/releases/` est **vide** : c'est ce que le `rollback()` de `deploy.sh` a laissé
après l'échec du 2026-08-15. Sans conséquence tant que rien ne sert, mais le premier déploiement
réussi doit soit l'écraser proprement, soit être précédé d'un `rm`.

## Contraintes strictes (métier)

**Ce ticket est d'abord une décision.** Trois issues, et la troisième n'existait pas dans la
première rédaction :

**C — déclencher à la main, puis décider** *(recommandée)*. `deploy.yml` accepte désormais une
entrée `branch` : on lance un déploiement manuel, on regarde, on vérifie `/up`, et **ensuite**
seulement on fixe la politique de branche avec des faits. Un premier déploiement de production ne
devrait jamais être l'effet de bord d'un merge.
*(La partie outillage est faite — voir « Delta » ci-dessous.)*

**A — `master` reste la branche de production.** On y amène `dev` (fast-forward), ce qui déclenche
`deploy.yml` pour la première fois. Simple, mais la première exécution d'un workflow jamais exercé
se produit sans qu'on l'ait choisie.

**B — `dev` devient la branche de production.** Le déclencheur suit `dev`, `master` est archivé. Le
plus simple à tenir dans la durée, mais supprime le palier que `preview` → `master` formait, et
fait déployer en production **chaque merge de PR**.

## Delta à produire

- [x] Mesurer l'état réel — fait, ci-dessus.
- [x] Rendre le déploiement de production **déclenchable à la main sur une branche choisie** :
      `deploy.yml` expose une entrée `branch` (défaut `master`) et la transmet à `deploy.sh`.
      Sans elle, un `workflow_dispatch` déployait `master` **codé en dur**, c'est-à-dire l'état du
      2026-05-18 — antérieur à `deploy.sh` lui-même.
- [ ] Trancher entre A, B et C.
- [ ] Déployer, vérifier `/up` → 200, et vérifier que les 3 migrations sont passées.
- [ ] **Écrire le flux de branches** dans `CLAUDE.md` et le guide. Aujourd'hui il ne se déduit que
      des `on: push: branches:` des workflows.
- [ ] Aligner la branche par défaut du dépôt sur la décision.
- [ ] **Peupler les sept index Meilisearch** après le premier déploiement (`scout:import` par
      modèle, cf. étape 5 ci-dessus). `deploy.sh` ne le fait pas, et un index vide ne lève aucune
      erreur : la recherche répond « aucun résultat » en silence.
- [ ] Poser la garde contre la récidive : une divergence prolongée entre branche de production et
      `dev` doit **se voir**. Un écart de quelques commits pendant quelques heures est normal ;
      31 commits pendant trois mois est une panne silencieuse — et ici, une absence totale.

## Critères d'acceptation

- [ ] AC1 — `https://api.takussan.com/up` répond **200**.
- [ ] AC2 — le flux de branches est écrit dans `CLAUDE.md`, et **correspond** aux déclencheurs des
      workflows (vérifiable en lisant les deux côte à côte).
- [ ] AC3 — une garde signale une divergence anormale entre la branche de production et `dev`.
- [ ] AC4 — l'entrée D-04 de `docs/ardoise.md` est fermée en citant ce ticket.
- [ ] AC5 — les sept index Meilisearch de production sont **peuplés**, vérifié par
      `/indexes/<uid>/stats` (`numberOfDocuments > 0`) et non par la seule absence d'erreur au
      déploiement.

## Hors périmètre

- Le déploiement du frontend, entièrement hors dépôt sur Vercel (ardoise D-10). `takussan.com`
  répond, lui.
- La migration PHP du serveur : **elle n'est pas nécessaire**, le serveur est déjà en 8.4+.

## Notes d'implémentation

Ardoise D-04. Seule dette P0 non soldée du chantier de reprise, précisément parce qu'un
déploiement de production est une action sortante et difficilement réversible : elle appartient à
une personne, pas à un agent.

**La leçon de ce ticket est dans sa propre correction.** Sa première rédaction déduisait l'état de
la production de la configuration des workflows — « `deploy.yml` se déclenche sur `master`, donc la
production suit `master` ». C'est un raisonnement sur le déclencheur, pas sur l'exécution. Une seule
commande — `gh run list` — montrait qu'il n'avait jamais tiré. *Un fichier de CI dit ce qui
DEVRAIT arriver ; l'historique des runs dit ce qui EST arrivé.*
