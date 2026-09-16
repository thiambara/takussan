---
id: TCK-519
title: "Les seuils du budget de la machine déclenchent une alerte — mémoire, disque, vol de CPU"
status: done
phase: P0
family: technique
estimate: S
wave: 64
created: 2026-09-14
updated: 2026-09-15
depends_on: [TCK-515]
blocks: [TCK-517]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, dokploy, surveillance, budget, adr-0028]
---

## Objectif utilisateur

Que le porteur apprenne qu'un seuil du budget est franchi **avant** qu'un disque plein ne mette la
base en lecture seule pour quatre environnements.

## Contrat de données

Le plan (§ « Budget de la machine ») fixe trois seuils : **≥ 1 500 Mo** disponibles, **`st` < 10**
sur `vmstat`, **disque < 75 %**. Rien ne les surveille : le relevé note que *Server Threshold*
n'existe pas en Dokploy auto-hébergé (`isCloud`), et UptimeRobot ne voit que le HTTP. Le conteneur
le plus lourd est Dokploy lui-même, seul sans plafond (867 → 1 013 → 920 Mo). Le canal Telegram
des notifications de Dokploy existe déjà (relevé, ligne « Notifications de Dokploy »).

## Contraintes strictes (métier)

- Le jeton du bot Telegram et l'identifiant du canal vivent dans `/etc/default/seuils` (mode `600`),
  jamais dans le dépôt ni dans le chat.
- Une alerte par **franchissement**, pas une toutes les cinq minutes : un marqueur par seuil dans
  `/run/seuils/`, effacé au retour sous le seuil, avec un message de retour à la normale.
- Silence total quand tout tient : un message vide ou « OK » périodique finirait ignoré.

## Delta à produire

- [x] `deploy/server/seuils.sh` : lit `MemAvailable`, `df /`, `vmstat 5 3` (colonne `st`), la mémoire
  du service `dokploy` ; compare aux seuils du plan, envoie sur Telegram
- [x] Unité `seuils.timer` (toutes les 5 minutes) et `seuils.service`, posées par `bootstrap.sh`
  comme `fermer-port-3000`
- [x] Ablation : `SEUIL_MEM_MO=100000 deploy/server/seuils.sh` envoie un message ; relancé, n'en
  envoie pas un second ; ramené au seuil normal, envoie le retour à la normale
- [x] `docs/infra/hebergement.md` : ligne « Surveillance des seuils », avec la date de la première
  alerte de test et la commande `systemctl list-timers seuils.timer`
- [x] Le plan, § Budget : la phrase « relevés en D6 puis surveillés » cite ce ticket

## Critères d'acceptation

- [x] AC1 — `systemctl list-timers` montre `seuils.timer` actif, prochain passage sous 5 minutes
- [x] AC2 — l'ablation ci-dessus produit exactement deux messages Telegram (franchissement, retour)
- [x] AC3 — un passage au repos n'écrit rien : `journalctl -u seuils.service` sans ligne d'envoi
- [x] AC4 — `bootstrap.sh` rejoué sur le serveur ne duplique ni l'unité ni le timer (idempotence)

## Hors périmètre

- Un tableau de bord de métriques (Prometheus, Grafana) : hors budget de la machine.
- Un plafond mémoire sur le service `dokploy` lui-même : à décider sur la série de mesures que ce
  ticket produit.

## Notes d'implémentation

- **Le canal Telegram de Dokploy n'a jamais fonctionné.** Le *Chat ID* enregistré dans Dokploy est le
  `@username` du bot (`my_tg_docploy_bot`) ; l'API rend `403 Forbidden: the bot can't send messages
  to the bot`, et `getUpdates` est vide. Le script l'a attrapé parce qu'il lit `"ok":true` dans la
  réponse au lieu du code de sortie de curl. Relevé corrigé (ligne « Notifications de Dokploy »).
- Les unités sont dans `bootstrap.sh` (§ 7) avec `ConditionPathExists=/usr/local/sbin/seuils` :
  rejouer bootstrap sur un serveur sans le script ne casse rien, le timer attend. Seule la section 7
  a été rejouée sur le serveur (deux fois, idempotente) : un `bootstrap.sh` entier refait
  `apt-get upgrade`, qui pourrait monter `docker-ce` et redémarrer tous les conteneurs — c'est
  l'objet de TCK-526.
- `/etc/default/seuils` a été écrit sur le serveur depuis la table `telegram` de la base de Dokploy,
  sans transiter par le poste ; il porte donc aujourd'hui le même identifiant faux.
- PR #280 (unités, script, relevé) ; le ticket est resté `doing` pour AC2 jusqu'au 2026-09-15.
- **Chat ID posé le 2026-09-15, 00:08 Z.** Le porteur a écrit au bot ; sur le serveur, `getUpdates`
  a rendu 4 messages d'une même conversation privée (identifiant numérique à 10 chiffres). Posé par
  `sed` dans `/etc/default/seuils` (copie `/root/seuils.env.avant-tck519`) et par `UPDATE telegram
  SET "chatId"` dans la base de Dokploy — la ligne est relue à chaque envoi, rien à redémarrer. La
  valeur n'a jamais quitté le serveur. `sendMessage` de test → `"ok":true`.
- **AC2, 2026-09-15, 00:09 Z, timer arrêté** : `SEUIL_MEM_MO=100000 seuils` → `⚠ … mémoire
  disponible 5291 Mo (seuil 100000)` ; rejoué → rien ; `seuils` → `✓ … retour à la normale … (seuil
  1500)` ; rejoué au repos → rien ; `/run/seuils` vide ; aucune ligne `✗`. Deux messages, reçus.
  Timer relancé, `active`, prochain passage sous 5 minutes.
- **Le premier essai a produit quatre messages, et c'est le timer qui les explique, pas le script.**
  À 00:08:35 Z, `seuils.timer` est passé entre la première et la deuxième commande (journal :
  `✓ … retour à la normale`), a retiré le marqueur, et la deuxième commande a alerté de nouveau.
  L'usage du script et le relevé disent désormais d'arrêter le timer pendant l'ablation.

