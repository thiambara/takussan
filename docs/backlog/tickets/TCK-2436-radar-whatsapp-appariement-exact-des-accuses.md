---
id: TCK-2436
title: "Radar : appariement exact des accusés d'un envoi WhatsApp ambigu, par biz_opaque_callback_data"
status: todo
phase: P3
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2427]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, whatsapp, adr-0077]
---

## Objectif utilisateur

L'opérateur sait si un message envoyé par l'API, dont l'envoi est resté ambigu (délai, 5xx), est finalement arrivé ou
non, sans que le code devine.

## Contexte

TCK-2427 lit les accusés de livraison du numéro du Radar et les apparie par `provider_message_id`. Un envoi `ambiguous`
par délai ou 5xx n'a pas d'identifiant : ses accusés, s'il est parti, arrivent avec un identifiant inconnu et sont
ignorés. Il reste `ambiguous`, et l'opérateur juge.

Une première version de TCK-2427 rattachait un tel accusé au seul envoi ambigu de l'annonceur (« adoption »). La
vérification adverse l'a fait retirer, sur deux scénarios reproduits que `RadarWhatsappReceiptGuardTest` garde :

- l'accusé d'une relance dont l'écriture est défaite, adopté par un ancien ambigu, rouvrait le double envoi ;
- un message étranger au Radar, sur le même numéro, faisait d'un envoi jamais parti un message « lu ».

L'API Cloud de Meta accepterait un champ `biz_opaque_callback_data` à l'envoi d'un message, renvoyé dans les `statuses`.
Il permettrait un appariement **exact** : un jeton propre à la ligne `radar_outreaches`, posé avant l'appel. **Rien n'en
est vérifié** : ni l'existence du champ pour un message de gabarit, ni sa présence dans chaque accusé, ni sa longueur.

## Delta à produire

- [ ] Vérifier dans la documentation de Meta, avant toute écriture, que `biz_opaque_callback_data` est accepté pour un
      message de gabarit et renvoyé dans les `statuses` (`sent`, `delivered`, `read`, `failed`). Si ce n'est pas le
      cas, clore ce ticket comme caduc, avec la référence lue.
- [ ] Sinon : poser un jeton aléatoire par message avant l'envoi (`RadarCloudWhatsappDriver`), le garder sur la ligne,
      et apparier par lui un accusé dont l'identifiant est inconnu ; l'identifiant de Meta est alors écrit sur la ligne.
- [ ] `RadarWhatsappReceiptGuardTest` reste vert : jamais d'appariement par inférence.

## Critères d'acceptation

- [ ] AC1 — Un accusé `failed` portant le jeton d'un envoi `ambiguous` sans identifiant le passe à `failed`.
- [ ] AC2 — Un accusé sans jeton, ou au jeton inconnu, n'est rattaché à rien.

## Hors périmètre

- Renvoyer automatiquement un message dont l'envoi a échoué : l'opérateur juge.
