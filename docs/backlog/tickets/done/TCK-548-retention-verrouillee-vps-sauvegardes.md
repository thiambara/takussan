---
id: TCK-548
title: "Une règle de rétention sur vps-sauvegardes : aucun jeton, même celui du VPS, ne peut effacer une sauvegarde récente"
status: done
phase: P2
family: technique
estimate: S
wave: 67
created: 2026-09-22
updated: 2026-10-18
depends_on: [TCK-541]
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models: []
tags: [infra, sauvegarde, r2, securite]
---

## Objectif utilisateur

Que le porteur puisse toujours restaurer la préproduction, même si le VPS qui l'héberge est
compromis : les sauvegardes des derniers jours ne doivent pouvoir être ni effacées ni écrasées depuis
le serveur.

## Contrat de données

Relevé le 2026-09-22, à la bascule de TCK-541 (`docs/infra/hebergement.md`, lignes « Destination des
sauvegardes », « Sauvegardes planifiées », « Copie du seau privé des médias ») :

- `vps-sauvegardes` reçoit tout : dumps PostgreSQL et MySQL (Dokploy, 14 exemplaires), configuration
  de Dokploy (7), la dernière archive du volume de médias (sauvegarde désactivée, archive gardée), et
  la copie nocturne de `takussan-preview-private` (`deploy/server/sauvegarde-seau-prive.sh`).
- Deux jetons y écrivent depuis le VPS : celui de la destination Dokploy et `takussan-preview-backup`.
  Tous deux sont en *Object Read & Write* — un jeton de compte R2 n'a qu'un type de permission pour
  tous ses seaux, et la rotation de Dokploy doit pouvoir supprimer. Un attaquant qui tient le VPS
  tient donc le droit d'effacer toutes les sauvegardes.
- Le filtre IP (`178.18.247.62`) posé sur `takussan-preview-backup` ferme la fuite du jeton, pas la
  compromission du serveur lui-même.

## Contraintes strictes (métier)

- **Une suppression pendant la rétention doit ÉCHOUER, et l'échec se mesure** : un `DeleteObject` et
  un `PutObject` par-dessus un objet récent, avec le jeton du VPS, rendent une erreur.
- **La rotation de Dokploy ne doit pas casser.** Elle supprime les exemplaires au-delà de son compte :
  la rétention doit être plus courte que l'âge du plus jeune exemplaire qu'elle supprime (7 jours
  pour la configuration de Dokploy, 14 pour les bases). Si une suppression refusée fait échouer le
  job de sauvegarde lui-même, c'est un rouge — le relever avant de conclure.
- La copie du seau privé (`rclone copy`) ne supprime rien : elle n'est pas concernée par la
  rotation, mais un objet réécrit à la même clé doit rester lisible.

## Delta à produire

- [x] Règle de rétention (*Bucket Lock*) sur `vps-sauvegardes`, durée à trancher par la mesure (point
      de départ : 7 jours), posée par l'API ou le tableau de bord de Cloudflare, et sa commande relue
      dans `docs/infra/hebergement.md`.
- [x] Épreuve de refus : un objet d'essai écrit, puis `DeleteObject` et `PutObject` par-dessus avec
      le jeton du VPS → refus ; relevé des codes.
- [x] Épreuve de la rotation : un passage réel des sauvegardes Dokploy (bases et configuration) après
      la pose, sans erreur, et le compte d'exemplaires inchangé.
- [x] `docs/infra/hebergement.md` : ligne « Destination des sauvegardes » mise à jour, avec la
      durée, la mesure et la marche à suivre pour la lever.

## Critères d'acceptation

- [x] AC1 — Depuis le VPS, avec chacun des deux jetons, supprimer ou écraser un objet de moins de N
      jours dans `vps-sauvegardes` échoue ; le code d'erreur est noté.
- [x] AC2 — Les sauvegardes Dokploy de la nuit suivant la pose réussissent, et leur rotation
      supprime bien les exemplaires plus vieux que la rétention (compte d'objets avant/après).
- [x] AC3 — `sauvegarde-seau-prive` passe toujours (`Result=success`) après la pose.
- [x] AC4 — La restauration à blanc d'un objet (celle de TCK-541) se rejoue au même md5.

## Hors périmètre

- Une copie hors de Cloudflare (autre fournisseur, poste du porteur) : un second lieu est une
  décision à part.
- Les seaux de la production : ils suivront en phase F, avec leur propre règle.
- Le seau public des médias : il n'est pas sauvegardé (conversions régénérables), c'est voulu.

## Notes d'implémentation

Fait en session le 2026-10-18, avec l'accord du porteur (option a), en même temps que le verrou de
`takussan-wal` (ADR-0069 § 5).

- **Durée : 7 jours**, règle `retention-7-jours`, préfixe vide (tout le seau), posée par l'API de
  Cloudflare (`PUT /accounts/<compte>/r2/buckets/vps-sauvegardes/lock`) et relue
  (`maxAgeSeconds: 604800`). Avant de la poser, les quatre écrivains du seau ont été relevés :
  - dumps `takussan_preview` : 14 exemplaires, le plus jeune supprimé a 14 jours → compatible ;
  - configuration de Dokploy : **7 exemplaires**, soit la suppression chaque matin d'un exemplaire de
    6 j 23 h 59 → refusée sous le verrou. Portée à **10** (`backup.update`, relu) avant la pose ;
  - sauvegarde du volume de l'API : désactivée, réglée à 1 — à porter à 8 au moins si on la
    réactive (écrit dans `hebergement.md`) ;
  - copie du seau privé : `rclone copy`, ne supprime jamais.
- **AC1** — depuis le VPS, avec le jeton de la destination Dokploy (lu dans la base de Dokploy par
  un script qui ne l'imprime pas) puis avec `takussan-preview-backup` : écrire une sonde → 0 ;
  l'effacer, l'écraser, et effacer le dump le plus récent → sortie 1, `ObjectLockedByBucketPolicy`,
  pour les deux jetons. Les sondes restent 7 jours sous `sonde-verrou/`.
- **AC2** — mesuré sur un passage **manuel** (18:59), pas sur celui de la nuit :
  `manualBackupPostgres` → 14 exemplaires avant, 14 après, celui du 2026-10-05 supprimé par la
  rotation ; `manualBackupWebServer` → 7 avant, 8 après (rotation à 10). Statut `done` des deux dans
  `overview.backups`. La nuit suivante, `fraicheur-sauvegardes` (06:00) relira le dump de 03:00.
- **AC3** — `systemctl start sauvegarde-seau-prive` → `Result=success`, `ExecMainStatus=0`.
- **AC4** — un objet de `takussan-preview-private` (77 439 o), restauré depuis
  `vps-sauvegardes/takussan-preview-private/` : md5 `5f433c671e6b0d10a568d164b12e8025`, identique à
  la source.
