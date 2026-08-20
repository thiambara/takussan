---
id: TCK-298
title: "Les versions d'infrastructure de production ne sont épinglées nulle part dans le dépôt"
status: done
phase: P2
family: technique
estimate: S
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-289]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, ci, versions, reproductibilite, dette]
---

## Objectif utilisateur

Qu'on puisse lire dans le dépôt quelle version de chaque service la production exécute — au lieu de
la découvrir en se connectant au serveur, ou de la deviner à partir de la commande d'installation.

## Contrat de données

Aucune donnée applicative. Mesuré le 2026-08-16 :

| Service | Développement | CI | Production |
|---|---|---|---|
| MySQL | `mysql:8.0` ✅ | `mysql:8.0` ✅ | 8.0.46 — **mesuré** (TCK-289), non épinglé dans le dépôt |
| Meilisearch | `getmeili/meilisearch:v1.16` ✅ | `getmeili/meilisearch:v1.16` ✅ | **rien** |
| Redis | `redis:8-alpine` ✅ | absent | **rien** |
| PHP | 8.4.x | `8.4` ✅ | 8.4 — déduit d'un déploiement réussi (D-01), non épinglé |
| Node | — | — | **rien** |

`scripts/server-setup.sh` **n'installe rien** : il vérifie la présence de PHP-FPM et de nginx et
imprime la commande à lancer à la main. Le provisionnement de production est donc entièrement
manuel, et aucune version n'y est écrite.

## Contraintes strictes (métier)

- **Ne rien déduire de la configuration.** C'est la leçon de D-43 et de TCK-289 : le compose et la
  CI ont tourné dix-huit mois sur MariaDB parce qu'un commentaire affirmait ce que la prod
  exécutait. Toute valeur écrite par ce ticket est soit **mesurée sur la machine**, soit marquée
  explicitement comme une cible à vérifier — jamais présentée comme un constat.
- Ce ticket **ne déploie rien et ne touche pas au serveur**. Il rend le dépôt capable de dire ce
  que la production exécute ; la confrontation avec la machine appartient à TCK-288.
- Une valeur épinglée sans garde retombe en dette au premier `apt upgrade`. La sortie doit inclure
  un mécanisme de vérification, pas seulement un tableau.

## Delta à produire

- [x] Un fichier unique de référence des versions d'infrastructure (format à choisir : JSON lisible
      par script, sur le modèle de `waves.json`), portant pour chaque service la version **dev**,
      **CI** et **prod cible** → `docs/infra/versions.json`, 6 services
- [x] Étendre `scripts/check-db-engine.mjs` — ou créer son pendant générique — pour vérifier
      l'accord entre ce fichier, `docker-compose.yml` et `.github/workflows/*.yml` →
      `scripts/check-infra-versions.mjs` (pendant générique ; `check-db-engine` reste seul
      propriétaire du moteur et de la collation, les deux sont tenus d'accord par `accords_croises`)
- [x] Brancher la garde dans `repo-ci.yml` → dernière étape, `--report`
- [x] Prouver la garde **par mutation** : désaligner une version, vérifier le rouge → 7 mutations,
      tableau dans `docs/infra/versions.md`
- [x] Documenter dans `docs/infra/` la commande de mesure qui produit la colonne « prod » →
      `docs/infra/versions.md`, + `_mesure_prod` dans le JSON

## Critères d'acceptation

- [x] AC1 — chaque service du tableau ci-dessus a une version écrite dans le fichier de référence,
      ou une mention explicite « non mesuré » qui nomme la commande à lancer — **et la garde le
      REFUSE autrement** : `etat` n'accepte que `mesure` (avec `valeur` + `commande` + `date` +
      `source`) ou `non_mesure` (avec `valeur: null` + `commande` + `pourquoi`). Mailpit a été
      ajouté au tableau du ticket, qui l'omettait.
- [x] AC2 — désaligner `docker-compose.yml` d'une version fait échouer la CI, et le message nomme
      le service et les deux valeurs → `docker-compose.yml:117 — meilisearch en DEV vaut
      \`getmeili/meilisearch:v1.15\` ; docs/infra/versions.json déclare \`getmeili/meilisearch:v1.16\``
- [x] AC3 — aucune valeur de la colonne « prod » n'est déduite d'un guide d'installation ; chacune
      cite sa source (commande + date) — **une seule case est renseignée** (MySQL 8.0.46, mesurée le
      2026-08-13 par TCK-289) ; les cinq autres sont `non_mesure` avec leur commande. Aucun accès au
      serveur n'a été utilisé pour ce ticket.

## Hors périmètre

- Le moteur de base de données — déjà épinglé et gardé par TCK-289.
- Épingler les versions **sur le serveur** (`apt-mark hold`, images) — TCK-288.
- Le déploiement du frontend — TCK-299.

## Notes d'implémentation

**Garde générique plutôt qu'extension de `check-db-engine.mjs`.** Les deux répondent à des questions
différentes : `check-db-engine` tient le MOTEUR et la COLLATION d'un seul service (et sa collation
n'a pas d'équivalent chez les autres), la nouvelle tient les VERSIONS de tous. Les fusionner aurait
fait porter à un fichier deux constantes de production de nature différente. Elles sont tenues
d'accord par `accords_croises` — le catalogue exige de retrouver `8.0.46-0ubuntu0.24.04.3` et
`mysql:8.0` dans `check-db-engine.mjs`, hors commentaires.

**Une mutation a trouvé un défaut dans la garde elle-même.** Remplacer `PROD.version` par
`8.0.47-…` dans `check-db-engine.mjs` laissait la garde VERTE : le littéral `8.0.46-…` survit trois
fois dans le docblock qui raconte la mesure de D-43, et l'accord croisé cherchait dans le fichier
entier. La garde lisait donc la *mémoire* du défaut et la prenait pour la déclaration. Corrigé par
`elaguerJs()` — blocs `/* */` vidés, lignes ouvrant par `//` ou `*` blanchies. *Un accord croisé qui
accepte une correspondance en commentaire n'accorde rien.* Les 7 mutations sont tabulées dans
`docs/infra/versions.md`.

**Le périmètre CI est LU, pas énuméré.** `readdirSync('.github/workflows')` plutôt qu'une liste :
`repo-ci.yml` raconte lui-même avoir vu sa liste de déclencheurs manquer un fichier trois fois de
suite. Corollaire : `.github/workflows/**` et `takussan-api/composer.json` ont été ajoutés aux deux
blocs `paths` de `repo-ci.yml` (la garde lit `web-ci.yml` pour `node-version` et `composer.json` pour
`config.platform.php`, ni l'un ni l'autre n'étaient déclencheurs).

**Contradiction trouvée, non résolue.** Le tableau de l'ardoise **D-09** donne `PHP · Production =
8.3 (cf. D-01)`, alors que **D-01** démontre l'inverse — une borne inférieure à **8.4.1**, tirée d'un
`composer install --no-dev` réussi sur un lock qui exigeait `php >=8.4.1`. Les deux ne peuvent pas
être vrais, et aucun n'est un relevé machine. D-09 porte désormais un encadré qui renvoie au
catalogue et signale la contradiction ; la trancher exige de lancer `php -v` sur le serveur (TCK-288).

**Cinq cases sur six restent `non_mesure`, et c'est le livrable.** Aucun accès au serveur n'a été
utilisé. Ce ticket rend le dépôt capable de DIRE ce qu'il ignore, avec la commande qui y remédie —
il ne prétend pas le savoir.

**Non fait, délibérément** : le `CLAUDE.md` racine ne cite toujours qu'une garde sur sept dans son
bloc « Racine ». Écart préexistant, et le fichier est édité en parallèle par un autre chantier.
