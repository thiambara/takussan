---
id: TCK-2407
title: "La copie nocturne du seau privé garde pour toujours les fichiers que le Radar purge"
status: todo
phase: P1
family: technique
estimate: S
wave: 80
created: 2026-10-29
updated: 2026-10-29
depends_on: [TCK-2391]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [infra, sauvegarde, donnees-personnelles, purge, radar, adr-0077, adr-0029]
---

## Objectif utilisateur

Une capture, une photo ou une réponse que la purge du Radar efface (90 jours, ou dès un STOP) ne subsiste pas dans la sauvegarde.
Le texte légal le promet : « effacées dès que vous demandez à ne plus être contacté. Ne subsiste alors qu'une empreinte » et
« Sauvegardes : conservées au plus 14 jours, puis écrasées » (`takussan-web/src/content/legal/privacy.ts`, § 6).

## Contexte

Relevé le 2026-10-29 par la vérification adverse de TCK-2391, sur `feat/radar-revocation-purge` :

- `deploy/server/sauvegarde-seau-prive.sh` (TCK-541) fait chaque nuit un `rclone copy` de `takussan-<env>-private` vers
  `vps-sauvegardes/takussan-<env>-private/`. `docs/infra/hebergement.md` (« Copie du seau privé des médias ») le dit : « jamais
  `sync` : un objet supprimé du seau reste dans la sauvegarde ».
- Tout ce que `RadarPurger` et `RadarOrphanFiles` (TCK-2391) effacent du seau privé — captures d'annonces, réserve de photos, captures
  d'accord — survit donc **sans limite** dans la copie. Aucune règle d'expiration n'existe sur `vps-sauvegardes`.
- L'écart contredit `privacy.ts` § 6 deux fois (90 jours puis seule l'empreinte ; sauvegardes 14 jours) et rend faux, en pratique, le critère
  « n'a plus ni capture » de TCK-2391 (AC2).
- Aucun ticket ne le suit : `docs/ardoise.md` et le backlog ne le mentionnent pas ; TCK-885 ne traite que la liste des effacements.
- La copie n'est pas propre au Radar : elle garde aussi les pièces supprimées à la demande d'un utilisateur (KYC, documents). Le défaut est
  général ; le Radar est ce qui le rend visible.

## Contraintes strictes (métier)

- Rien ne se décide ici sans le porteur : changer la politique de sauvegarde (durée, mécanisme) engage `privacy.ts` § 6 et ADR-0029.
- Une sauvegarde qui ne contient plus rien d'effacé après 14 jours ne doit pas, pour autant, perdre un objet encore vivant : la restauration à
  blanc de TCK-541 reste vraie.
- Le jeton `takussan-preview-backup` n'a pas le droit de supprimer dans le seau privé : la solution ne doit pas lui en donner.
- Le risque inverse (un VPS compromis efface `vps-sauvegardes`) reste couvert par la règle de rétention décrite dans `hebergement.md` ; ne pas
  le rouvrir.

## Delta à produire

- [ ] Choisir : (a) une règle de cycle de vie R2 sur `vps-sauvegardes` qui expire les objets après 14 jours *depuis leur copie* — sans effet sur
      un objet vivant, que la copie nocturne ne retransfère pas ; ou (b) une copie datée par jour (`vps-sauvegardes/<seau>/AAAA-MM-JJ/`) avec
      rotation à 14 jours ; ou (c) `rclone sync` plus une copie datée, si le porteur accepte d'abandonner « jamais `sync` ». Écrire l'ADR avant.
      Vérifier d'abord si (a) tient : un objet vivant et inchangé n'est plus recopié, donc il vieillirait puis disparaîtrait — (a) seul est faux.
- [ ] Appliquer le choix dans `deploy/server/sauvegarde-seau-prive.sh` et `bootstrap.sh` § 8, puis le relever sur le serveur de préproduction.
- [ ] Mettre à jour `docs/infra/hebergement.md` (ligne « Copie du seau privé des médias ») avec la durée réellement mesurée.

## Critères d'acceptation

- [ ] AC1 — Un objet effacé du seau privé n'existe plus dans la sauvegarde 14 jours plus tard (mesuré sur la préproduction : un fichier
      d'essai posé, copié, effacé du seau, puis absent de la copie à J+14 ou à la date simulée par le mécanisme retenu).
- [ ] AC2 — Un objet vivant et inchangé depuis plus de 14 jours est toujours dans la sauvegarde et se restaure (même md5).
- [ ] AC3 — Le passage nocturne signale toujours son échec sur Telegram.

## Hors périmètre

- Le seau public (conversions régénérables, avatars, logos), non copié.
- La sauvegarde de la base PostgreSQL (WAL-G) et sa rétention.

## Notes d'implémentation

_(à remplir par implementing-specs)_
