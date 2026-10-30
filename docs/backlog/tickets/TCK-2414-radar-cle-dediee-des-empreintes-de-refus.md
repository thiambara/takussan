---
id: TCK-2414
title: "Radar : une clé dédiée pour l'empreinte des refus, qu'une rotation d'APP_KEY ne rend plus méconnaissables"
status: doing
phase: P1
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2391]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, donnees-personnelles, securite, adr-0077]
---

## Objectif utilisateur

Un annonceur qui a dit STOP n'est plus jamais démarché par le Radar, même après une rotation de la clé de
l'application.

## Contexte

[ADR-0077](../../adr/0077-le-radar.md) §9 : après un STOP, le numéro en clair s'efface et seule son empreinte
HMAC (`radar_advertisers.phone_hmac`) reste. Relevé de la vérification adverse de TCK-2391 (point M3) : cette
empreinte se calcule sous une clé **dérivée d'`app.key`** (`RadarPhone::key()`, `config/radar.php` :
`phone_hmac_key => null`, aucune variable d'environnement). Faire tourner `APP_KEY` rend toutes les empreintes
méconnaissables, et le numéro en clair n'existe plus pour les recalculer : la saisie suivante du même numéro crée
un annonceur neuf, sans refus, et le Radar redémarche quelqu'un qui a dit STOP.

## Contraintes strictes

- **Rien ne casse aujourd'hui** : sans clé dédiée, l'empreinte reste celle d'aujourd'hui (repli documenté sur
  `app.key`).
- **Un refus oublié n'est pas acceptable ; un lien de réclamation invalidé par une rotation l'est.**
- La clé neuve est déclarée dans `.env.example` **et** `.env.docker` (`check-env-parity.mjs`,
  `check-webhook-env-keys.mjs` verts).
- Ne pas toucher à Dokploy : ce que le porteur doit y poser est écrit ici.

## Delta à produire

- [ ] Inventaire de tous les HMAC du Radar qui dépendent d'`app.key`, et décision pour chacun.
- [ ] `RADAR_PHONE_HMAC_KEY` (clé dédiée) et `RADAR_PHONE_HMAC_PREVIOUS_KEYS` (anciennes clés reconnues) lues
      par `config/radar.php`.
- [ ] Les lectures d'un refus reconnaissent l'empreinte sous la clé courante, les anciennes clés et le repli
      sur `app.key` (et `APP_PREVIOUS_KEYS`) ; l'écriture se fait sous la clé courante.
- [ ] Sonde de santé : la clé dédiée absente hors `local`/`testing` rend la sonde `degraded`.
- [ ] Commande de rotation qui réécrit les empreintes recalculables sous la clé courante et compte celles qui ne
      le sont pas.

## Critères d'acceptation

- [ ] AC1 — Sans clé dédiée, `RadarPhone::hmac()` rend exactement l'empreinte d'avant ce ticket.
- [ ] AC2 — Un annonceur qui a dit STOP, numéro purgé, empreinte écrite sous le repli `app.key` : après la pose
      d'une clé dédiée, une nouvelle annonce de son numéro est reconnue comme refusée et ne crée aucun annonceur
      neuf.
- [ ] AC3 — Même chose après une rotation de la clé dédiée, l'ancienne étant listée dans
      `RADAR_PHONE_HMAC_PREVIOUS_KEYS`.
- [ ] AC4 — La sonde de santé signale la clé absente hors local, et se tait en local ou quand la clé est posée.
- [ ] AC5 — La commande de rotation réécrit l'empreinte d'un annonceur dont le numéro est connu et compte, sans
      les toucher, ceux dont le numéro est purgé.

## Hors périmètre

- Les empreintes sous `app.key` hors du Radar (`PhoneFingerprint`, `AlertSubscriber::contactHash()`,
  `PayoutMethod::fingerprint()`, etc.) : TCK-2430.
