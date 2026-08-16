---
id: TCK-296
title: "Les 6 clés d'environnement des gardes webhook ne sont déclarées nulle part"
status: todo
phase: P1
family: technique
estimate: S
wave: 37
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: [TCK-288]
spec_refs:
  features:
    - docs/features.md#23-notifications
  models: []
tags: [back, securite, webhook, sms, whatsapp, environnement, dette]
---

## Objectif utilisateur

Qu'un accusé de livraison SMS ou WhatsApp arrive réellement après un déploiement — au lieu d'être
rejeté en silence par une garde dont la clé de configuration n'existe dans aucun fichier
d'environnement.

## Contrat de données

Aucun modèle, aucun endpoint nouveau. Six clés d'environnement à déclarer, et une garde de parité à
étendre :

| Clé | Garde qui la lit | Comportement si absente |
|---|---|---|
| `SMS_WEBHOOK_URL_TOKEN` | jeton d'URL des webhooks SMS | jeton vide → **404** |
| `SMS_ORANGE_WEBHOOK_IPS` | `RestrictIpMiddleware` | allowlist vide → **403** |
| `SMS_MTARGET_WEBHOOK_IPS` | `RestrictIpMiddleware` | allowlist vide → **403** |
| `SMS_LAM_WEBHOOK_IPS` | `RestrictIpMiddleware` | allowlist vide → **403** |
| `WHATSAPP_WEBHOOK_URL_TOKEN` | jeton d'URL du webhook WhatsApp | jeton vide → **404** |
| `WHATSAPP_WEBHOOK_APP_SECRET` | vérification de signature Meta | secret vide → rejet |

## Contraintes strictes (métier)

- **Les gardes échouent fermé, et c'est correct.** Ce ticket ne les assouplit pas : il rend leur
  configuration visible. Un webhook rejeté faute de configuration doit le rester ; ce qui doit
  changer, c'est qu'on puisse le voir venir.
- **`.env.example` est l'environnement de TEST de la CI** (ardoise D-54, corrigé le 2026-08-16).
  Toute valeur ajoutée à ce fichier devient de la configuration de suite de tests, et une valeur
  vide y **écrase** le défaut de `config/`. Les six clés s'y déclarent donc avec une valeur qui ne
  casse aucun test — pas avec `=` suivi du vide.
- `scripts/check-env-parity.mjs` compare `.env.example` et `.env.docker`. Il ne pouvait rien voir
  ici puisque la clé manquait **des deux côtés** — la garde n'est pas en défaut, son périmètre
  l'est.

## Delta à produire

- [ ] Déclarer les 6 clés dans `takussan-api/.env.example` (valeurs de test sûres)
- [ ] Déclarer les 6 clés dans `takussan-api/.env.docker` (valeurs de développement)
- [ ] Déclarer les 6 clés dans `.env.preview` et `.env.prod`
- [ ] Étendre `scripts/check-env-parity.mjs` — ou ajouter une garde dédiée — pour qu'une clé lue par
      `config/` et absente des quatre fichiers casse la CI
- [ ] Prouver la garde **par mutation** : retirer une clé, vérifier que la CI rouge, la remettre
- [ ] Corriger le docblock d'`OrangeSmsStatusController` s'il affirme encore une protection absente
- [ ] Tests : un test par garde qui vérifie le rejet fermé (404 / 403) avec configuration vide

## Critères d'acceptation

- [ ] AC1 — `grep -c '^SMS_' .env.example .env.docker .env.preview .env.prod` rend un compte non nul
      dans les quatre fichiers
- [ ] AC2 — retirer une seule des six clés d'un seul des quatre fichiers fait échouer la CI, et le
      message nomme la clé manquante
- [ ] AC3 — la suite reste verte après ajout des clés à `.env.example` (elle est l'env de test)
- [ ] AC4 — aucun docblock de contrôleur webhook n'affirme un middleware que sa route ne porte pas

## Hors périmètre

- La vérification de signature Orange et Mtarget — **tranchée le 2026-08-16** : les opérateurs n'en
  émettent pas (ardoise D-49). Le basculement Mtarget est TCK-294.
- La mise en production elle-même — TCK-288.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
