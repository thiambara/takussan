---
id: TCK-352
title: "Le mailer `resend` est déclaré mais son paquet n'est pas une dépendance — aucun courriel n'est jamais parti"
status: todo
phase: P1
family: bug
estimate: S
wave: null
created: 2026-08-24
updated: 2026-08-24
depends_on: []
blocks: [TCK-288]
spec_refs:
  features:
    - docs/features.md#23-notifications
  models: []
tags: [infra, mail, notifications, dependances, dette]
---

## Objectif utilisateur

Qu'une notification transactionnelle — invitation, confirmation de réservation, expiration —
**arrive**. Aujourd'hui aucune n'est jamais partie, sur aucun environnement déployé.

## Ce que la mesure a établi (2026-08-24)

Découvert pendant la bascule PostgreSQL de la préproduction (ADR-0020) : le seed a généré des
notifications, et les workers les ont toutes rejetées.

```
$ php artisan tinker --execute='...failed_jobs...'
  x22  App\Notifications\BookingExpiredNotification
       Error: Class "Resend" not found in .../Illuminate/Mail/MailManager.php
```

Les quatre faits qui composent le défaut :

| Fait | Commande |
|---|---|
| `config/mail.php:64` déclare un mailer `resend` | `grep -n -A3 "'resend'" config/mail.php` |
| `.env.preview` **et** `.env.prod` sélectionnent `MAIL_MAILER=resend` | relevé dans `docs/infra/prod-drivers.json` |
| `resend/resend-php` est **absent de `composer.json` ET de `composer.lock`** | `grep -c '"name": "resend/' composer.lock` → `0` |
| Le paquet est absent du `vendor` de la release en service **et de la précédente** | `ls -d .../releases/*/takussan-api/vendor/resend` |

**Ce n'est pas une régression de la bascule.** L'ancienne release, du 2026-08-20, présentait
exactement le même manque. Le défaut existait depuis la mise en place de `MAIL_MAILER=resend` ; rien
ne l'avait révélé parce que la préproduction ne produisait pas assez de notifications pour qu'on
regarde `failed_jobs`.

> *Un transport de courrier déclaré dans `config/` mais absent du `composer.lock` n'échoue qu'à
> l'exécution, une notification à la fois, dans une table que personne ne consulte.* C'est le profil
> de défaut le plus cher de ce dépôt : silencieux, différé, et il se cumule.

## Contraintes strictes (métier)

- **La correction ne se décide pas depuis `.env`.** Écrire `MAIL_MAILER=log` masquerait le symptôme
  et supprimerait la seule trace qui reste.
- **Le domaine d'envoi est une seconde question, distincte.** `.env.preview` déclare
  `MAIL_FROM_ADDRESS=no-reply@support.checkprintplus.com` et
  `MAIL_CONTACT_ADDRESS=contact@checkprintplus.com` — l'identité d'un **autre projet** hébergé sur le
  même serveur. Installer le paquet fera partir des courriels ; encore faut-il qu'ils partent au bon
  nom, depuis un domaine vérifié côté Resend. Les deux points se corrigent ensemble ou le premier
  aggrave le second.
- Aucune garde du dépôt ne peut attraper ce défaut aujourd'hui : `check-env-parity.mjs` compare les
  `.env` entre eux, `check-webhook-env-keys.mjs` compare les `.env` au code. **Aucune ne compare
  `config/` au `composer.lock`.**

## Delta à produire

- [ ] Ajouter `resend/resend-php` (ou `resend/resend-laravel`) aux dépendances de production et
      régénérer `composer.lock`
- [ ] Vérifier le domaine d'envoi réellement vérifié dans le compte Resend, et aligner
      `MAIL_FROM_ADDRESS` / `MAIL_CONTACT_ADDRESS` des secrets `ENV_FILE_PREVIEW` et `ENV_FILE`
- [ ] Garde `scripts/check-mail-transport.mjs` : tout transport nommé dans `config/mail.php` dont
      l'implémentation vit dans un paquet doit avoir ce paquet dans `composer.lock`. **La liste des
      transports est dérivée du fichier de configuration, jamais écrite à la main.**
- [ ] Test : `MailTransportResolvableTest` — le mailer par défaut de chaque `.env` livré se résout
      sans lever
- [ ] Vider `failed_jobs` de la préproduction **après** correction, pas avant : les 22 lignes sont
      la preuve

## Critères d'acceptation

- [ ] `composer.lock` contient le paquet du transport `resend`
- [ ] Sur la préproduction, une notification de test **arrive** dans une boîte réelle — pas
      « le job ne lève plus », mais un courriel reçu
- [ ] `scripts/check-mail-transport.mjs` **échoue** si l'on retire le paquet du `composer.json`
      (vérification par ablation — un vert qui resterait vert ne prouverait rien)
- [ ] L'adresse d'expédition ne porte plus le domaine d'un autre projet
- [ ] `failed_jobs` est vide sur la préproduction, après qu'un rejeu ait réussi

## Hors périmètre

- Le contenu et la traduction des courriels (next-intl, principe n°5)
- Le choix d'un autre fournisseur que Resend
- La configuration SPF/DKIM du domaine — à traiter si la vérification Resend l'exige, dans un ticket
  dédié

## Notes d'implémentation

_(à remplir par implementing-specs)_
