---
id: TCK-2458
title: "Seconde unité et timer de copie du seau privé de production"
status: todo
phase: P0
family: technique
estimate: S
wave: 64
created: 2026-11-01
updated: 2026-11-01
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [infra, sauvegardes, r2, production, adr-0029]
---

## Objectif utilisateur

Le porteur retrouve, dans la fenêtre de 14 jours, un original ou une pièce privée de production perdue, comme il le peut déjà pour la préproduction.

## Contrat de données

Aucune donnée applicative. Le plan, F1 étape 6, renvoie à ce ticket.

Mesuré le 2026-11-01 (audit du serveur, P10) : `deploy/server/sauvegarde-seau-prive.sh` n'a qu'un couple `SOURCE`/`CIBLE`, aux lignes 54 et 55, par défaut la préproduction, et `bootstrap.sh` § 8 n'installe qu'une unité. Le seau `takussan-prod-private` n'existe pas encore.

## Contraintes strictes (métier)

- Le script n'est pas dupliqué : la seconde unité lui passe `SOURCE=takussan-prod-private` et `CIBLE=vps-sauvegardes/takussan-prod-private`.
- ⚠ Le script source `/etc/default/sauvegarde-seau-prive` **après** avoir reçu l'environnement de l'unité : si ce fichier pose `SOURCE` ou `CIBLE`, il écrase ceux de la seconde unité et la copie de production part en préproduction. Non relu sur le serveur : à vérifier avant la pose.
- ⚠ Le message d'alerte du script cite `journalctl -u sauvegarde-seau-prive` en dur : il doit nommer l'unité qui a échoué.
- Sans seau de production, rien ne tourne et rien n'alerte : la préproduction ne doit pas recevoir une alerte par nuit jusqu'à la phase F.
- Deux passages ne se chevauchent pas : le passage de préproduction a duré 8 min 25 le 2026-10-30, et le timer ajoute jusqu'à 5 minutes de délai aléatoire. Les créneaux pris se relisent dans `hebergement.md` (dump de production prévu à 02:00, copie à 02:30, dump de préproduction à 03:00, WAL-G le dimanche à 03:30).
- La rétention reste de 14 jours, comme le promet `privacy.ts` § 6.

## Delta à produire

- [ ] `deploy/server/bootstrap.sh` § 8 : unités `sauvegarde-seau-prive-prod.service` et `.timer`, `OnCalendar=*-*-* 01:30:00` ; `EnvironmentFile=/etc/default/sauvegarde-seau-prive-prod` et `ConditionPathExists` sur ce même fichier, qui porte `SOURCE` et `CIBLE` et ne se pose qu'en F1 étape 6.
- [ ] `deploy/server/sauvegarde-seau-prive.sh` : l'alerte nomme l'unité en cours, et `/etc/default/sauvegarde-seau-prive` ne peut plus écraser un couple reçu de l'unité.
- [ ] `scripts/test-sauvegarde-seau-prive.sh` : un second couple sur le R2 simulé, sans mélange d'instantanés ni de marqueurs avec le premier.
- [ ] `docs/infra/hebergement.md`, runbook : le geste de F1 étape 6, jeton `takussan-preview-backup` étendu à `takussan-prod-private` ou jeton propre, et la ligne du relevé une fois la pose faite.

## Critères d'acceptation

- [ ] AC1 — Le harnais joue deux couples en alternance : chaque instantané et chaque `.complet` reste sous sa propre `CIBLE`.
- [ ] AC2 — Par ablation : un `/etc/default/sauvegarde-seau-prive` qui pose `SOURCE` n'écrase plus le couple de la seconde unité, et le harnais rougit si cette protection est retirée.
- [ ] AC3 — Rejouer `bootstrap.sh` sur un serveur sans `/etc/default/sauvegarde-seau-prive-prod` : l'unité existe, `systemctl start` la saute sur sa condition, aucune alerte ne part, et la copie de préproduction reste inchangée.
- [ ] AC4 — Une fois le seau créé (F1 étape 6) : un passage réel écrit `vps-sauvegardes/takussan-prod-private/jours/<date>/.complet`, et une restauration à blanc rend le même md5.
- [ ] AC5 — Un échec forcé de la copie de production alerte sur Telegram en nommant `sauvegarde-seau-prive-prod`.

## Hors périmètre

- `PREFIXES` de `fraicheur-sauvegardes` et les autres surveillances à étendre à la production (audit, P12).
- La création du seau et du jeton `takussan-prod-app` (plan, F1 étape 6).
- `--retirer-copie-plate`, sans objet ici : la production n'a jamais eu de copie plate.

## Notes d'implémentation

_(à remplir par implementing-specs)_
