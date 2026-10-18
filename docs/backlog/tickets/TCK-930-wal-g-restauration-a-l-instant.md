---
id: TCK-930
title: "La base se restaure à l'instant près : WAL-G archive les journaux dans takussan-wal, et la restauration à un instant choisi est mesurée"
status: doing
phase: P1
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-880, TCK-882]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, sauvegardes, postgresql, adr-0028, adr-0069]
---

## Contexte

Étape 5 de l'application d'[ADR-0069](../../adr/0069-deux-environnements-dokploy-configuration-hors-de-github.md)
(§ 5). Aujourd'hui, la seule sauvegarde de la base est le `pg_dump` nocturne de Dokploy (03:00) :
une panne peut coûter jusqu'à 24 heures d'écritures, et la marche arrière d'une migration ratée
est la restauration du dernier dump (`hebergement.md`, « Avant une migration irréversible »).

Prêts au 2026-10-18 : le seau `takussan-wal` et son jeton (créés par le porteur), le jeton cloisonné
(mesuré : il lit, écrit et efface dans `takussan-wal`, `AccessDenied` sur `vps-sauvegardes` et sur
la liste des seaux), et un verrou de rétention de 7 jours sur les deux seaux (TCK-548).

## Objectif utilisateur

Une panne ou une migration ratée ne coûte plus que quelques minutes d'écritures : la base se
restaure à un instant choisi, sur une instance vierge, et la copie se lit.

## Delta à produire

- `deploy/postgres/Dockerfile` : l'image servie aujourd'hui (`pgvector/pgvector:pg17`, épinglée à son
  empreinte relevée sur le serveur), plus WAL-G 3.0.9 (somme vérifiée), `archive_mode=on`,
  `archive_command=wal-g wal-push %p`, `archive_timeout=300`.
- `deploy/postgres/epreuve.sh` : archivage, sauvegarde de base et restauration à un instant choisi,
  dans des conteneurs jetables, vers un volume local (`WALG_FILE_PREFIX`).
- `.github/workflows/image-postgres.yml` : construit, éprouve, pousse `ghcr.io/thiambara/takussan-postgres:sha-<commit>`.
  Jamais de déploiement automatique : changer l'image redémarre toutes les bases du serveur.
- `deploy/server/wal-g.sh` et ses unités (`bootstrap.sh` § 11) : sauvegarde de base le dimanche à
  03:30, élagage au-delà de 14 jours, veille de l'archivage toutes les 15 minutes (Telegram).
- `scripts/check-shell.mjs` : le troisième Dockerfile passe sous hadolint.
- Sur le serveur : l'environnement WAL-G dans le service Database de Dokploy, la bascule d'image, la
  première sauvegarde de base, les unités, puis la mesure.
- `docs/infra/hebergement.md` : le runbook « WAL-G » et la ligne du relevé.

## Critères d'acceptation

- [ ] **AC1** — L'épreuve sort en 0 sur l'image construite, en local et en CI ; sans l'instant
      visé (ablation), elle sort en 1 en lisant « apres,avant ».
- [ ] **AC2** — La base de préproduction tourne sur l'image `sha-` : `pg_stat_archiver` compte des
      segments archivés et aucun échec, et ces segments sont lus dans `takussan-wal`.
- [ ] **AC3** — Une sauvegarde de base existe dans `takussan-wal` (`wal-g backup-list`), les
      deux timers sont actifs, et `wal-g.sh etat` ne signale rien.
- [ ] **AC4** — Restauration à un instant choisi, depuis R2 seul, sur une instance vierge
      (ADR-0028 § 7, ADR-0069 § 5) : une ligne écrite avant l'instant visé est présente, une ligne
      écrite après est absente, les comptes de lignes sont relevés, et
      `backup:verify-encryption` sort en 0 sur la copie (1 avec `--cle-fausse`).
- [ ] **AC5** — La veille alerte au franchissement et se tait ensuite (`BASE_MAX_J=0`, `ENVOI=0`),
      puis rend un retour à la normale.

## Hors périmètre

- La base de production : elle n'existe pas encore (phase F, TCK-517). Elle vivra dans la même
  instance, et donc dans la même archive.
- Le chiffrement côté client des archives (`WALG_LIBSODIUM_KEY`) : les dumps de Dokploy ne le sont
  pas non plus, et une clé de plus à garder hors du serveur se décide à part.
- Retirer le `pg_dump` nocturne : il reste, copie logique lisible sans WAL-G (ADR-0069 § 5).

## Reste sur dev

Le code est livré ; restent la bascule du serveur et les mesures AC2 à AC5, en session.

## Notes d'implémentation

- **AC1, en local** (2026-10-18, image construite en `linux/amd64` sous émulation) : l'épreuve sort
  en 0 — `archive_mode=on`, `archive_timeout=5min`, WAL-G `v3.0.9`, `vector` 0.8.7, quatre segments
  archivés et aucun échec, base B reconstruite portant `avant` seul. **Ablation** : sans
  `recovery_target_time`, B porte `apres,avant` et l'épreuve sort en 1. Conteneurs et volumes
  jetables retirés après les deux passages (relevé : 0 et 0).
- **`WALG_PREVENT_WAL_OVERWRITE=true`** dans l'environnement du serveur : sous le verrou de
  rétention, un segment renvoyé après un envoi réussi (coupure entre l'envoi et l'accusé) serait
  refusé à l'écrasement, et l'archivage resterait bloqué sur lui. Avec ce réglage, WAL-G constate
  que l'objet existe à l'identique et rend 0 — vérifié le 2026-10-18 sur l'image : renvoi
  identique → `already archived with equal content, skipping`, sortie 0 ; contenu différent → sortie 1.
- **Première bascule (2026-10-18, 19:16 Z), archivage bloqué** : l'image de base ne porte aucune
  autorité de certification (`/etc/ssl/certs/ca-certificates.crt` absent). WAL-G joint R2 en TLS,
  échoue sur `x509: certificate signed by unknown authority`, et **retente en silence** : le
  premier `wal-push` est resté pendu, `pg_stat_archiver` à 0 archivé et 0 échec, aucune ligne
  d'erreur au journal. La cause n'est sortie qu'avec `WALG_S3_MAX_RETRIES=0`. Écartés en chemin, par
  mesure : le réseau (même blocage sur `bridge`, depuis le poste aussi, en IPv4 forcé), les
  identifiants (rclone liste le seau avec le même jeton), `GetBucketVersioning`, HTTP/2, ML-KEM, et
  WAL-G 3.0.8. La base n'a rien perdu : PostgreSQL garde un segment tant que son archivage n'a pas
  réussi.
  Correctif : `ca-certificates` (épinglé) dans l'image, et une étape 0 de l'épreuve qui fait
  vérifier par WAL-G le certificat d'un point d'accès S3 public — **ablation** : sur l'image
  d'avant, l'épreuve sort en 1 sur `x509` ; sur la nouvelle, `InvalidAccessKeyId`, puis le
  reste vert. *Une épreuve qui archive dans un dossier local ne prouve rien du transport.*
- **La veille ne juge pas l'âge du dernier segment** : une base inactive n'en produit aucun, et
  `archive_timeout` ne ferme un segment que s'il a reçu des écritures. Elle juge
  `pg_stat_archiver` (un échec plus récent que le dernier succès) et l'âge de la dernière
  sauvegarde de base.
