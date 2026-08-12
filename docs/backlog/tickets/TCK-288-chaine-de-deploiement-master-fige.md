---
id: TCK-288
title: "Premiere mise en production — la chaine n'a jamais tourne"
status: todo
phase: P0
family: technique
estimate: M
wave: null
created: 2026-08-12
updated: 2026-08-12
depends_on: []
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
- [ ] Poser la garde contre la récidive : une divergence prolongée entre branche de production et
      `dev` doit **se voir**. Un écart de quelques commits pendant quelques heures est normal ;
      31 commits pendant trois mois est une panne silencieuse — et ici, une absence totale.

## Critères d'acceptation

- [ ] AC1 — `https://api.takussan.com/up` répond **200**.
- [ ] AC2 — le flux de branches est écrit dans `CLAUDE.md`, et **correspond** aux déclencheurs des
      workflows (vérifiable en lisant les deux côte à côte).
- [ ] AC3 — une garde signale une divergence anormale entre la branche de production et `dev`.
- [ ] AC4 — l'entrée D-04 de `docs/ardoise.md` est fermée en citant ce ticket.

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
