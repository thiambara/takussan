---
id: TCK-355
title: "Le VPS se bloque au niveau du noyau : l'API devient injoignable pendant plusieurs minutes, cause non établie"
status: todo
phase: P1
family: technique
estimate: M
wave: null
created: 2026-08-24
updated: 2026-08-24
depends_on: []
blocks: [TCK-288]
spec_refs:
  features: []
  models: []
tags: [infra, vps, noyau, disponibilite, securite, observabilite]
---

## Objectif utilisateur

Qu'une requête vers l'API aboutisse. Deux fois en sept jours, elle n'aboutissait pas — pas
lentement : **pas du tout**, pendant plusieurs minutes, sans que rien dans l'application soit en
cause.

## Ce que la mesure a établi (2026-08-24)

Signalé comme « les requêtes du front sont très lentes ». Mesuré depuis l'extérieur pendant
l'épisode :

```
dns=0.003489s tcp=0.000000s tls=0.000000s ttfb=0.000000s total=75.004628s code=000
```

La connexion TCP n'aboutit jamais. Le journal du noyau donne la raison :

```
19:09:30  watchdog: BUG: soft lockup - CPU#2 stuck for 27s!  [postgres]
19:10:04  watchdog: BUG: soft lockup - CPU#0 stuck for 22s!  [systemd-journal]
19:11:36  watchdog: BUG: soft lockup - CPU#3 stuck for 39s!  [kworker/u8:3]
19:12:23  systemd-networkd.service: State 'stop-watchdog' timed out. Killing.
19:12:23  systemd-resolved.service:  State 'stop-watchdog' timed out. Killing.
19:12:30  systemd-journald.service:  State 'stop-watchdog' timed out. Killing.
```

Trois cœurs sur quatre bloqués de 22 à 39 s, puis systemd tue le démon réseau, le résolveur et le
journal pour dépassement de leur chien de garde. **Le service revient tout seul** quand
`systemd-networkd` redémarre : rien n'est réparé, le système se relève.

**Deux épisodes en sept jours** : 3 blocages le 2026-08-20 à 04:33, 5 le 2026-08-24 à 19:09.

### Ce que ce n'était pas — écarté par mesure, pas par raisonnement

| Hypothèse | Mesure |
|---|---|
| Saturation CPU | 95-99 % **idle**, plus gros processus à 28 % |
| Manque de mémoire | 5,7 Go libres ; **0** événement du tueur OOM en 7 jours |
| Saturation disque | `%util` = 0, aucun processus en état `D`, ext4 sur `/dev/sda1`, aucune resynchronisation RAID |
| Table `conntrack` pleine | 137 sur 262 144 |
| Files de jobs qui s'empilent | `jobs = 0` |
| Trafic applicatif | 5 requêtes/heure sur `preview.api.takussan.com` |

> *Une machine oisive qui refuse des connexions ne se diagnostique pas dans l'application.* Le
> premier réflexe — chercher une requête lente, un index manquant, un worker emballé — aurait
> consommé la soirée sans rien trouver, parce que rien de tout cela n'était en cause.

## Ce qui a été appliqué, et ce que ça ne règle pas

**Aucune des trois actions ne corrige la cause.** Deux réduisent une charge parasite, la troisième
rend le prochain épisode attribuable.

1. **`sysstat`, échantillonnage à 2 minutes** (`/etc/systemd/system/sysstat-collect.timer.d/`).
   `sar -u` rend désormais `%steal` avec son historique. C'est **la** question restée sans réponse :
   un blocage multi-cœurs sur une VM oisive, sans pression mémoire ni disque, désigne le plus
   souvent l'hyperviseur qui déprogramme l'invité — mais *le vol de CPU ne se mesure pas
   rétroactivement*, et il valait 0 quand j'ai regardé, une heure après. La cadence de 10 minutes
   par défaut a été ramenée à 2 : un blocage de 20-40 s se dilue dans une moyenne de 10 minutes, et
   la mesure répondrait alors sur la moyenne au lieu de répondre sur l'incident.

2. **`fail2ban`, jail `sshd` en mode agressif** — **1621** tentatives d'authentification refusées en
   une heure, **2236** lignes de journal pour la seule IP `45.153.34.235` en deux heures, attaque
   toujours en cours pendant le relevé. Chaque tentative fork un `sshd`, traverse PAM et écrit dans
   le journal — et `systemd-journald` est précisément l'une des tâches qui a bloqué son cœur 22 s.
   **Ce n'est pas une cause établie ; c'est une charge parasite qui frappe exactement le composant
   qui a lâché**, et qui devait disparaître de toute façon. Cinq IP bannies dans les premières
   minutes.

   Choisi **plutôt que `ufw limit 22/tcp`** : `limit` bannit sur le NOMBRE de connexions, donc il
   frappe aussi les scripts légitimes qui en enchaînent — les nôtres. `fail2ban` bannit sur
   l'ÉCHEC d'authentification, et un accès par clé n'échoue jamais.

3. **`PasswordAuthentication no`** — dans `/etc/ssh/sshd_config.d/01-takussan-durcissement.conf`.

   ⚠️ **Le NOM du fichier est la moitié du correctif.** `sshd` retient la **première** occurrence
   d'une directive, jamais la dernière, et l'`Include` des drop-ins est en tête de `sshd_config`. Or
   `50-cloud-init.conf` déclarait `PasswordAuthentication yes` et l'emportait **déjà** sur le `no` de
   `60-cloudimg-settings.conf`. Un fichier nommé `99-` aurait été lu, accepté, et sans aucun effet —
   en silence. *Deux fichiers de configuration qui se contredisent ne produisent pas une erreur :
   ils produisent un gagnant, et ce n'est pas celui qu'on croit.*

### L'accès de secours, vérifié AVANT la coupure

Couper une voie d'accès sans avoir éprouvé la suivante est le geste qui transforme un durcissement
en incident. Dans l'ordre, et chaque point mesuré :

- `passwd -S root` → **`P`**, et `getty@tty1` + `serial-getty@ttyS0` **actives** : la console web
  Contabo ne passe pas par `sshd` et reste ouverte quoi qu'on fasse ici ;
- une **clé de secours** dédiée installée pour `root` **et** `deploy`, **et son ouverture éprouvée
  sur les deux comptes** avant que la directive ne soit écrite ;
- sur 30 jours : 257 connexions par clé pour `deploy`, 52 pour `root`, **7 par mot de passe** — ces
  7 venant des **mêmes IP** que les connexions par clé, et le seul compte humain étant `deploy`.
  Aucun tiers n'en dépendait, y compris côté CheckPrint Plus, hébergé sur la même machine.

Vérifié après rechargement : les quatre chemins (clé habituelle × `deploy`/`root`, clé de secours ×
`deploy`/`root`) ouvrent, et une tentative par mot de passe rend `Permission denied (publickey)`.

## Delta à produire

- [ ] **Attendre un troisième épisode et lire `sar`** — `%steal`, `%iowait`, charge, à la minute
      près. C'est la seule façon de trancher entre « l'hyperviseur déprogramme la VM » et « quelque
      chose dans l'invité bloque un cœur »
- [ ] Si `%steal` est élevé : ouvrir un ticket chez Contabo avec l'horodatage des trois épisodes et
      les traces `soft lockup`. Un VPS mutualisé qui bloque 40 s est un problème d'hôte, pas de
      locataire
- [ ] Si `%steal` est nul : instruire la piste invité — noyau `6.8` d'Ubuntu 24.04, pile réseau
      `virtio`, `btrfs`/`raid` chargés mais inutilisés sur un ext4. Chercher un correctif amont
      plutôt que contourner
- [ ] **Décider ce qu'il faut d'ici là pour la production** — c'est ce qui rend ce ticket bloquant
      pour TCK-288 : mettre `api.takussan.com` en service sur une machine qui devient injoignable
      plusieurs minutes sans prévenir n'est pas la même décision selon qu'on sait pourquoi ou non
- [ ] Rendre l'incident **visible sans qu'on le cherche** : aujourd'hui il n'a été trouvé que parce
      que quelqu'un a signalé une lenteur. Une sonde externe sur `/up` est le minimum

## Critères d'acceptation

- [ ] La cause du blocage est **nommée par une mesure**, pas par une hypothèse plausible — ou bien
      il est écrit noir sur blanc qu'elle reste inconnue, avec ce qui a été éliminé et comment
- [ ] `sar` a effectivement capté un épisode : la commande exacte et sa sortie figurent dans ce
      ticket. *Une instrumentation qui n'a jamais rien capté n'est pas vérifiée*
- [ ] Une indisponibilité de plus de 60 s de `preview.api.takussan.com` produit une alerte que
      personne n'a eu besoin de demander
- [ ] La décision sur la production est écrite, dans un sens ou dans l'autre

## Hors périmètre

- La compression et la latence applicative — c'est [TCK-348](TCK-348-compression-et-deploiement-preprod.md), soldé le 2026-08-24
- La première mise en production elle-même — [TCK-288](TCK-288-chaine-de-deploiement-master-fige.md), que ce ticket bloque sans le remplacer
- Le durcissement SSH au-delà de ce qui est décrit ci-dessus (2FA, port non standard, bastion) :
  aucun besoin mesuré, et chaque cran de plus est un cran de plus à retrouver le jour d'une panne

## Notes d'implémentation

_(à remplir par implementing-specs)_
