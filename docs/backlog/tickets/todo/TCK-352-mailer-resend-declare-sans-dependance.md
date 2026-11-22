---
id: TCK-352
title: "Le transport `resend` : SDK ajouté (TCK-515) ; reste le domaine d'envoi et la garde config ↔ lock"
status: todo
phase: P1
family: bug
estimate: S
wave: null
created: 2026-08-24
updated: 2026-11-16
depends_on: []
blocks: [TCK-288]
spec_refs:
  features:
    - docs/features.md#23-notifications
  models: []
tags: [infra, mail, notifications, dependances, dette]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : le volet code est caduc ; le reste relève du déploiement (phase F) et d'une garde.**

- Fermé : le SDK manquant — **3ab1d44ea** (TCK-515, 2026-09-14) ajoute `resend/resend-php`
  (`composer.json:26`, présent dans `composer.lock`) ; `ResendMailerTest` construit le transport.
  Les échecs de la préproduction ont été vidés après le SDK (`queue:flush`, 36 → 0).
- Changé de nature : la préproduction est en `MAIL_MAILER=log` **par décision du porteur**
  (2026-09-14, mesuré le 2026-11-01) ; la production, inexistante, est prescrite en `resend`
  (`env.api.production.example:131-137`, `MAIL_FROM_ADDRESS=contact@takussan.com`,
  `RESEND_API_KEY` vide). `MAIL_CONTACT_ADDRESS` n'existe plus ; `.env.preview`/`.env.prod` et les
  releases du serveur ont disparu (ADR-0028).
- Reste à faire :
  - **code** : garde `scripts/check-mail-transport.mjs` (`config/mail.php` ↔ `composer.lock`,
    transports dérivés) + ablation — absente ;
  - **déploiement (phase F, TCK-517)** : vérifier `takussan.com` chez Resend (SPF/DKIM), poser
    `RESEND_API_KEY` dans Dokploy production ; prouver l'arrivée d'un courriel réel.
- **Décision attendue du porteur** : où prouver l'arrivée — (a) en production à la phase F, ou
  (b) préproduction basculée temporairement sur `resend` vers une boîte de test ?

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
| `.env.preview` **et** `.env.prod` sélectionnent `MAIL_MAILER=resend` — *au 2026-11-16 : préproduction `MAIL_MAILER=log` (Dokploy, mesuré le 2026-11-01, décision du porteur) ; production `resend`, prescrit, environnement inexistant* | relevé dans `docs/infra/prod-drivers.json` |
| `resend/resend-php` est **absent de `composer.json` ET de `composer.lock`** — *présent depuis 3ab1d44ea (`composer.json:26`)* | `grep -c '"name": "resend/' composer.lock` → `0` (→ `1` au 2026-11-16) |
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
- **Le domaine d'envoi est une seconde question, distincte.** *Relevé 2026-11-16 : le gabarit de
  production déclare `MAIL_FROM_ADDRESS=contact@takussan.com` ; `MAIL_CONTACT_ADDRESS` n'existe
  plus ; reste à vérifier `takussan.com` (ou un sous-domaine) chez Resend.* Constat d'origine : `.env.preview` déclare
  `MAIL_FROM_ADDRESS=no-reply@support.checkprintplus.com` et
  `MAIL_CONTACT_ADDRESS=contact@checkprintplus.com` — l'identité d'un **autre projet** hébergé sur le
  même serveur — **arrêté depuis le 2026-10-04** : son domaine n'est donc plus une option, même
  provisoire. Installer le paquet fera partir des courriels ; encore faut-il qu'ils partent au bon
  nom, depuis un domaine vérifié côté Resend. Les deux points se corrigent ensemble ou le premier
  aggrave le second.
- Aucune garde du dépôt ne peut attraper ce défaut aujourd'hui : `check-env-parity.mjs` compare les
  `.env` entre eux, `check-webhook-env-keys.mjs` compare les `.env` au code. **Aucune ne compare
  `config/` au `composer.lock`.**

## Delta à produire

- [x] Ajouter `resend/resend-php` (ou `resend/resend-laravel`) aux dépendances de production et
      régénérer `composer.lock` (tenu par TCK-515, 3ab1d44ea, relevé 2026-11-16)
- [ ] Vérifier le domaine d'envoi réellement vérifié dans le compte Resend, et aligner
      `MAIL_FROM_ADDRESS` ~~/ `MAIL_CONTACT_ADDRESS` des secrets `ENV_FILE_PREVIEW` et `ENV_FILE`~~
      de l'onglet Environment Dokploy de la production (phase F, TCK-517) — les secrets `ENV_FILE*`
      et `MAIL_CONTACT_ADDRESS` ont disparu (ADR-0028)
- [ ] Garde `scripts/check-mail-transport.mjs` : tout transport nommé dans `config/mail.php` dont
      l'implémentation vit dans un paquet doit avoir ce paquet dans `composer.lock`. **La liste des
      transports est dérivée du fichier de configuration, jamais écrite à la main.**
- [ ] Test : `MailTransportResolvableTest` — le mailer par défaut de chaque `.env` livré se résout
      sans lever *(en partie tenu, pour `resend` seul, par `ResendMailerTest`)*
- [x] Vider `failed_jobs` de la préproduction **après** correction, pas avant : les 22 lignes sont
      la preuve (tenu : `queue:flush` 36 → 0 après le SDK, `docs/infra/hebergement.md`, relevé 2026-11-16)

## Critères d'acceptation

- [x] `composer.lock` contient le paquet du transport `resend` (tenu par TCK-515, relevé 2026-11-16)
- [ ] Sur la ~~préproduction~~ **production** (phase F) — ou la préproduction basculée temporairement
      sur `resend` vers une boîte de test, sur décision du porteur, puisqu'elle est en `log` par
      décision —, une notification de test **arrive** dans une boîte réelle — pas
      « le job ne lève plus », mais un courriel reçu
- [ ] `scripts/check-mail-transport.mjs` **échoue** si l'on retire le paquet du `composer.json`
      (vérification par ablation — un vert qui resterait vert ne prouverait rien)
- [ ] L'adresse d'expédition ne porte plus le domaine d'un autre projet *(vrai pour le gabarit de
      production, `contact@takussan.com`, relevé 2026-11-16 ; à revérifier dans Dokploy production
      à sa création)*
- [ ] `failed_jobs` est vide sur la préproduction, après qu'un rejeu ait réussi *(vidé 36 → 0 par
      `queue:flush`, sans rejeu : la préproduction est en `log` — à rejouer sur l'environnement de
      la preuve d'arrivée)*

## Hors périmètre

- Le contenu et la traduction des courriels (next-intl, principe n°5)
- Le choix d'un autre fournisseur que Resend
- La configuration SPF/DKIM du domaine — à traiter si la vérification Resend l'exige, dans un ticket
  dédié

## Notes d'implémentation

_(à remplir par implementing-specs)_
