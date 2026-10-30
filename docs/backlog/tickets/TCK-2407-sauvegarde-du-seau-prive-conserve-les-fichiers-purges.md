---
id: TCK-2407
title: "La copie nocturne du seau privé garde pour toujours les fichiers que le Radar purge"
status: review
phase: P1
family: technique
estimate: S
wave: 80
created: 2026-10-29
updated: 2026-10-30
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

- [x] Choisir : (a) une règle de cycle de vie R2 sur `vps-sauvegardes` qui expire les objets après 14 jours *depuis leur copie* — sans effet sur
      un objet vivant, que la copie nocturne ne retransfère pas ; ou (b) une copie datée par jour (`vps-sauvegardes/<seau>/AAAA-MM-JJ/`) avec
      rotation à 14 jours ; ou (c) `rclone sync` plus une copie datée, si le porteur accepte d'abandonner « jamais `sync` ». Écrire l'ADR avant.
      Vérifier d'abord si (a) tient : un objet vivant et inchangé n'est plus recopié, donc il vieillirait puis disparaîtrait — (a) seul est faux.
- [ ] Appliquer le choix dans `deploy/server/sauvegarde-seau-prive.sh` et `bootstrap.sh` § 8, puis le relever sur le serveur de préproduction.
      *Appliqué dans le dépôt ; le relevé sur la préproduction est au porteur (« Reste sur dev »).*
- [ ] Mettre à jour `docs/infra/hebergement.md` (ligne « Copie du seau privé des médias ») avec la durée réellement mesurée.
      *Ligne et runbook mis à jour ; la durée n'est pas encore mesurée sur R2 (« Reste sur dev »).*

## Critères d'acceptation

- [ ] AC1 — Un objet effacé du seau privé n'existe plus dans la sauvegarde 14 jours plus tard (mesuré sur la préproduction : un fichier
      d'essai posé, copié, effacé du seau, puis absent de la copie à J+14 ou à la date simulée par le mécanisme retenu).
      *Prouvé sur un R2 simulé à dates simulées ; la mesure sur la préproduction est au porteur (« Reste sur dev »).*
- [x] AC2 — Un objet vivant et inchangé depuis plus de 14 jours est toujours dans la sauvegarde et se restaure (même md5).
- [x] AC3 — Le passage nocturne signale toujours son échec sur Telegram.

## Hors périmètre

- Le seau public (conversions régénérables, avatars, logos), non copié.
- La sauvegarde de la base PostgreSQL (WAL-G) et sa rétention.

## Reste sur dev

Le code, le harnais et le runbook sont sur la branche `fix/sauvegarde-seau-prive-purge`. AC2 et AC3 sont
prouvés par `scripts/test-sauvegarde-seau-prive.sh`, qui joue le vrai script sur un R2 simulé, à des dates
simulées ; AC1 l'est aussi sur ce R2 simulé, mais son libellé exige une mesure **sur la préproduction**. Il
reste donc : **AC1 mesuré sur la préproduction, le relevé du delta, et la durée réellement mesurée dans
`hebergement.md`**. Ils reviennent au porteur : le dépôt ne touche ni au VPS ni à R2. Runbook : `docs/infra/hebergement.md`, « Passer la copie du
seau privé en instantanés ».

Prérequis du porteur, sur l'infrastructure :

1. **Redéploiement du script** : `scp deploy/server/sauvegarde-seau-prive.sh
   root@178.18.247.62:/usr/local/sbin/sauvegarde-seau-prive`. Les unités systemd de `bootstrap.sh` § 8 ne
   changent pas.
2. **Variable d'environnement** : aucune n'est requise. `RETENTION_JOURS` est facultative dans
   `/etc/default/sauvegarde-seau-prive` : 14 par défaut, à garder entre 8 et 14. Sous 8, le verrou de
   7 jours refuse la rotation. Au-delà de 14, `privacy.ts` § 6 ne tient plus.
3. **Règle de cycle de vie R2** : **aucune à poser**, et c'est voulu (ADR-0029, amendement du 2026-10-30,
   point 4). Le jeton et le verrou de 7 jours ne changent pas non plus.
4. **Relevé** : un premier passage, puis le second `--essai` du même jour, qui doit rendre « nothing to
   transfer », et la présence de `jours/<aujourd'hui>/.complet` et de `…/effacements/`. Ensuite AC2 (md5
   d'un objet de plus de 14 jours, lu dans le dernier jour complet) et AC3 (`SOURCE=takussan-seau-inexistant`,
   alerte Telegram). AC1 se mesure en temps réel : un objet d'essai posé, copié, effacé, puis absent 14 jours
   plus tard.
5. **Au moins 8 jours après le premier passage** : `sauvegarde-seau-prive --retirer-copie-plate`. Il retire
   l'ancienne copie unique, qui garde tout ce qui a été effacé depuis le 2026-09-22, et laisse `jours/` et
   `effacements/`. **Tant que cette étape
   n'est pas faite, la promesse de `privacy.ts` § 6 reste fausse pour ce qui a été effacé avant le
   déploiement.**
6. Porter la date et les comptes dans la ligne « Copie du seau privé des médias » du relevé, retirer son
   avertissement, puis passer ce ticket à `done`.

## Notes d'implémentation

- **(b) retenue, avec la rotation dans le script.** (a) seule est fausse : un objet vivant n'est jamais
  recopié, donc il vieillirait puis disparaîtrait. (c) se heurte au verrou de 7 jours : un STOP le lendemain
  d'une capture ferait échouer la copie, et alerter, chaque nuit pendant une semaine.
- **La rotation garde toujours le plus récent instantané complet** (marqueur `.complet`, posé après une copie
  réussie), et ne retire rien s'il n'y en a aucun. Elle tourne même après une copie en échec : une panne
  longue ne garde pas tout, mais ne retire jamais la seule sauvegarde complète. Une règle de cycle de vie,
  elle, effacerait aussi VPS arrêté : la sauvegarde disparaîtrait 14 jours après une panne.
- **Une copie interrompue laisse un instantané partiel** (rclone 1.71 : code 8, cible incomplète). Sans
  marqueur, on ne restaure pas depuis lui. Le marqueur ne s'écrit qu'une fois par jour : sous le verrou de
  7 jours, le réécrire serait refusé.
- **La liste des effacements a une copie jamais tournée** (`…/effacements/`, ADR-0044 § B amendé), exclue de
  `--retirer-copie-plate`. Les instantanés ne la portent que tant qu'elle vit dans le seau. L'ancienne copie
  plate avait déjà ce chemin : la restauration ne change pas.
- **Une configuration fautive est alertée.** Un secret absent ou un `JOUR` mal formé alerte. Un
  `RETENTION_JOURS` invalide alerte, et le passage se fait avec 14 (code 2 à la fin, pour que systemd le
  marque). Au-delà de 14, un avertissement est écrit au journal, sans refus.
- **Bornes** : la rotation retire les instantanés de `RETENTION_JOURS` jours ou plus. Un objet effacé entre le
  passage de J−1 et celui de J quitte la sauvegarde au passage de J+13, soit 14 jours au plus après, **tant que
  les passages réussissent**. Seuls les
  préfixes exactement `AAAA-MM-JJ` sont retirés : `2026-10-01-1` (un nom qui commence par une date sans en
  être une) et une date future restent.
- **Le compte des jours se fait en bash seul.** `date -d` n'existe pas hors de GNU, et le harnais doit
  tourner sur le poste (bash 3.2) comme en CI.
- **L'ancienne copie plate n'est retirée qu'à la demande** (`--retirer-copie-plate`), après un passage complet.
  C'est un effacement irréversible : il revient au porteur.

### Décisions prises en autonomie, à revoir

- **Mécanisme.** Retenu : un instantané complet par jour, et 14 gardés. Écarté : (c) `sync` avec un
  `--backup-dir` daté. Raison : (c) heurte le verrou de 7 jours, et le lever rouvrirait le risque du VPS
  compromis.
- **Qui fait la rotation.** Retenu : le script, à chaque passage, en gardant le plus récent instantané
  complet. Écarté : une règle de cycle de vie R2. Raison : la règle effacerait aussi pendant une panne.
- **Rotation après une copie en échec.** Retenu : elle tourne, mais garde le dernier complet. Écarté : ne
  rien retirer après un échec (première version). Raison : pendant une panne longue, ce qui a été effacé
  quitte quand même la sauvegarde, et la seule copie complète reste.
- **Rétention invalide.** Retenu : une alerte, puis un passage avec 14. Écarté : un refus en 2. Raison : une
  faute de frappe n'arrête pas les sauvegardes en silence (AC3).
- **Liste des effacements.** Retenu : une copie jamais tournée. Écarté : une liste lue seulement dans les
  instantanés. Raison : ADR-0044 § B reposait sur une copie sans limite. La liste ne porte que l'identifiant
  et l'instant.
- **Rétention.** Retenu : `RETENTION_JOURS`, réglable, 14 par défaut. Écarté : 14 en dur. Raison : c'est
  l'option la moins restrictive, et on revient en arrière sans redéployer.
- **Forme de la décision.** Retenu : un amendement d'ADR-0029. Écarté : un nouvel ADR. Raison : le point 8
  d'ADR-0029 portait la copie, et un numéro neuf risquait une collision avec les autres agents de la nuit.
- **Ancienne copie.** Retenu : un retrait à la demande du porteur, au moins 8 jours après. Écarté : un
  retrait automatique au premier passage. Raison : l'effacement est irréversible, et le verrou refuserait
  les objets récents.
- **Coût.** Retenu : un stockage multiplié par 14 (environ 2,8 Go et 100 000 opérations de classe A par
  mois). Écarté : l'option (c), plus économe. Raison : c'est le prix de la compatibilité avec le verrou. Le
  million gratuit tombe vers **33 000 objets** (1 M / 30 passages). La gratuité R2 est par compte, partagée
  avec les dumps, `takussan-wal` et les seaux de médias : à relire au tableau de bord avant la production.
