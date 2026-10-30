---
id: TCK-2414
title: "Radar : une clé dédiée pour l'empreinte des refus, qu'une rotation d'APP_KEY ne rend plus méconnaissables"
status: done
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

- [x] Inventaire de tous les HMAC du Radar qui dépendent d'`app.key`, et décision pour chacun.
- [x] `RADAR_PHONE_HMAC_KEY` (clé dédiée) et `RADAR_PHONE_HMAC_PREVIOUS_KEYS` (anciennes clés reconnues) lues
      par `config/radar.php`.
- [x] Les lectures d'un refus reconnaissent l'empreinte sous la clé courante, les anciennes clés et le repli
      sur `app.key` (et `APP_PREVIOUS_KEYS`) ; l'écriture se fait sous la clé courante.
- [x] Sonde de santé : la clé dédiée absente hors `local`/`testing` rend la sonde `degraded`.
- [x] Commande de rotation qui réécrit les empreintes recalculables sous la clé courante et compte celles qui ne
      le sont pas.

## Critères d'acceptation

- [x] AC1 — Sans clé dédiée, `RadarPhone::hmac()` rend exactement l'empreinte d'avant ce ticket.
- [x] AC2 — Un annonceur qui a dit STOP, numéro purgé, empreinte écrite sous le repli `app.key` : après la pose
      d'une clé dédiée, une nouvelle annonce de son numéro est reconnue comme refusée et ne crée aucun annonceur
      neuf.
- [x] AC3 — Même chose après une rotation de la clé dédiée, l'ancienne étant listée dans
      `RADAR_PHONE_HMAC_PREVIOUS_KEYS`.
- [x] AC4 — La sonde de santé signale la clé absente hors local, et se tait en local ou quand la clé est posée.
- [x] AC5 — La commande de rotation réécrit l'empreinte d'un annonceur dont le numéro est connu et compte, sans
      les toucher, ceux dont le numéro est purgé.

## Hors périmètre

- Les empreintes sous `app.key` hors du Radar (`PhoneFingerprint`, `AlertSubscriber::contactHash()`,
  `PayoutMethod::fingerprint()`, etc.) : TCK-2430.

## Prérequis du porteur (Dokploy, hors dépôt)

1. **Préproduction** — onglet Environment du Compose `takussan-api-preview` : poser
   `RADAR_PHONE_HMAC_KEY` (`openssl rand -base64 48`), laisser `RADAR_PHONE_HMAC_PREVIOUS_KEYS` vide, redéployer,
   puis `php artisan radar:rehash-phones` dans le conteneur `api`. La sonde `radar_phone_key` de la page Santé
   repasse `ok`. Les refus déjà écrits sous le repli restent reconnus tant qu'`APP_KEY` ne tourne pas (ou reste dans
   `APP_PREVIOUS_KEYS`) ; pour les garder au-delà, ajouter `radar-phone|<valeur d'APP_KEY>` à
   `RADAR_PHONE_HMAC_PREVIOUS_KEYS` — inutile si les refus de la préproduction sont des données d'essai.
2. **Production** (phase F, TCK-517) — poser `RADAR_PHONE_HMAC_KEY` **avant le premier démarchage**, avec une valeur
   distincte de celle de la préproduction. Aucun refus n'existe encore : aucune ancienne clé à garder.
3. **Garder la valeur** avec les autres secrets (`~/Sauvegardes/migration-secrets.env`) : perdue, elle rend les refus
   méconnaissables comme une rotation.
4. **Rotation** (fuite seulement) : l'ancienne valeur passe dans `RADAR_PHONE_HMAC_PREVIOUS_KEYS` (virgules), la neuve
   dans `RADAR_PHONE_HMAC_KEY`, puis `php artisan radar:rehash-phones`. Une ancienne clé ne se retire **jamais** tant que
   la commande compte des `refusals_without_number`.

## Notes d'implémentation

**Inventaire des HMAC du Radar sous `app.key` (re-mesuré le 2026-10-30) — deux, pas trois.**

- `RadarPhone::hmac()` (`radar_advertisers.phone_hmac`) : **prend la clé dédiée.** C'est l'empreinte des refus.
- `ClaimLinks::sign()` (lien de réclamation, TCK-2390) : **reste sous `app.key`**, voir les décisions.
- `PhoneFingerprint` n'est **pas** du Radar : son seul appelant est `WelcomeCreditService` (crédit de bienvenue). Il
  rejoint, avec les autres empreintes hors Radar, TCK-2430.
- Le reste du Radar hache **sans clé** (`hash('sha256', …)` : empreintes de saisie, captures, photos) : une rotation n'y
  change rien.
- `config/radar.php` portait déjà `phone_hmac_key`, mais à `null` écrit en dur : aucune variable ne la posait.

**La clé dédiée ne suffisait pas : il fallait reconnaître les anciennes.** Le numéro d'un refus est purgé ; son
empreinte ne se recalcule sous aucune clé neuve. Poser la clé dédiée sur la préproduction aurait donc fait, à lui seul,
ce que le ticket voulait empêcher. `RadarPhone::hmacs()` rend les empreintes sous la clé courante, les anciennes
(`RADAR_PHONE_HMAC_PREVIOUS_KEYS`) et le repli sur `app.key` et `APP_PREVIOUS_KEYS` ; les trois lectures d'un refus
(`refusedAmong()`, `findOrCreate()`, le rapprochement par téléphone) les cherchent toutes, l'écriture se fait sous la
courante. `findOrCreate()` cherche d'abord la clé courante, puis les anciennes seulement s'il en existe : sans clé dédiée,
la suite de requêtes est inchangée (deux épreuves de course de `RadarListingAdvertiserTest` s'accrochent à son texte SQL).
Un annonceur retrouvé sous une ancienne clé est réécrit sous la courante — le numéro est là pour la calculer.

## Décisions prises en autonomie, à revoir

- **Clé dédiée avec repli sur `app.key`** (retenu) plutôt qu'une clé obligatoire qui ferait échouer le démarrage
  (écarté) : rien ne casse avant que le porteur la pose.
- **Signal par la sonde de santé `radar_phone_key`, `degraded` hors `local`/`testing`** (retenu) plutôt qu'une garde de
  démarrage (écarté : elle couperait la préproduction dès la fusion) ou une ligne de `./dev.sh doctor` (écarté :
  `doctor` lit le `.env` du poste, où la clé n'est pas due). La route publique `/api/health` reste en 200.
- **Le repli sur `app.key` et `APP_PREVIOUS_KEYS` reste reconnu même clé dédiée posée** (retenu) plutôt que de ne
  reconnaître que les clés listées (écarté) : la pose de la clé sur un parc existant ne perd aucun refus, et une
  rotation d'`APP_KEY` est sûre dès aujourd'hui si l'ancienne reste dans `APP_PREVIOUS_KEYS`. Coût : un `whereIn` sur une
  empreinte par clé reconnue (quatre dans le cas courant).
- **`ClaimLinks` reste sous `app.key`** (retenu) plutôt que sous la clé dédiée (écarté) : c'est un secret de signature, qui
  doit pouvoir tourner après une fuite sans emporter les refus ; un lien tué par une rotation est acceptable (le message
  suivant en porte un neuf, et le code SMS reste exigé). Il reconnaît `APP_PREVIOUS_KEYS`, comme les URL signées de
  Laravel.
- **Commande `radar:rehash-phones` livrée** (retenu) plutôt que rien (écarté) : la réécriture paresseuse de
  `findOrCreate()` suffit à ne rien perdre, mais seule la commande dit combien d'empreintes dépendent encore d'une
  ancienne clé. Une empreinte déjà prise par une autre ligne est comptée en conflit, jamais écrasée.
- **Empreintes hors Radar renvoyées à TCK-2430** (retenu) plutôt que traitées ici (écarté : hors du périmètre du brief,
  et chacune demande sa propre décision).

