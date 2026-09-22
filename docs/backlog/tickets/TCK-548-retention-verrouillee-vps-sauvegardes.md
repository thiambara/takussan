---
id: TCK-548
title: "Une règle de rétention sur vps-sauvegardes : aucun jeton, même celui du VPS, ne peut effacer une sauvegarde récente"
status: todo
phase: P2
family: technique
estimate: S
wave: 67
created: 2026-09-22
updated: 2026-09-22
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

- [ ] Règle de rétention (*Bucket Lock*) sur `vps-sauvegardes`, durée à trancher par la mesure (point
      de départ : 7 jours), posée par l'API ou le tableau de bord de Cloudflare, et sa commande relue
      dans `docs/infra/hebergement.md`.
- [ ] Épreuve de refus : un objet d'essai écrit, puis `DeleteObject` et `PutObject` par-dessus avec
      le jeton du VPS → refus ; relevé des codes.
- [ ] Épreuve de la rotation : un passage réel des sauvegardes Dokploy (bases et configuration) après
      la pose, sans erreur, et le compte d'exemplaires inchangé.
- [ ] `docs/infra/hebergement.md` : ligne « Destination des sauvegardes » mise à jour, avec la
      durée, la mesure et la marche à suivre pour la lever.

## Critères d'acceptation

- [ ] AC1 — Depuis le VPS, avec chacun des deux jetons, supprimer ou écraser un objet de moins de N
      jours dans `vps-sauvegardes` échoue ; le code d'erreur est noté.
- [ ] AC2 — Les sauvegardes Dokploy de la nuit suivant la pose réussissent, et leur rotation
      supprime bien les exemplaires plus vieux que la rétention (compte d'objets avant/après).
- [ ] AC3 — `sauvegarde-seau-prive` passe toujours (`Result=success`) après la pose.
- [ ] AC4 — La restauration à blanc d'un objet (celle de TCK-541) se rejoue au même md5.

## Hors périmètre

- Une copie hors de Cloudflare (autre fournisseur, poste du porteur) : un second lieu est une
  décision à part.
- Les seaux de la production : ils suivront en phase F, avec leur propre règle.
- Le seau public des médias : il n'est pas sauvegardé (conversions régénérables), c'est voulu.

## Notes d'implémentation

_(à remplir par implementing-specs)_
