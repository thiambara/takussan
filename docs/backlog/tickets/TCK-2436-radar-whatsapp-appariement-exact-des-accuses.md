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

## Constat du 2026-10-30

Vérification préalable (décision A5 du porteur) faite dans la documentation de Meta **avant toute écriture** : elle ne
garantit pas ce dont AC1 dépend. **Rien n'est implémenté** ; le ticket reste `todo`.

Ce que dit la documentation, relevée le 2026-10-30 :

1. **Le renvoi dans les accusés n'est énuméré que pour `sent`, `delivered` et `read`.** L'ancienne référence de l'objet
   message (`/docs/whatsapp/cloud-api/reference/messages/`, aujourd'hui redirigée ; lue dans ses copies de l'Internet
   Archive du 2024-05-21 et du 2025-06-29) écrit : « *Cloud API does not process this field, it just returns it as part
   of sent/delivered/read message webhooks. Maximum 512 characters. Cloud API only.* » **`failed` n'y figure pas.**
2. **La référence actuelle des accusés ne restreint pas le champ à un statut, sans l'étendre explicitement.**
   [Status messages webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status)
   le place dans la syntaxe commune de `statuses`, avec pour seule condition « *Only included if message sent with
   biz_opaque_callback_data* », et le décrit : « *String assigned by the business to the `biz_opaque_callback_data`
   property in the send message request.* » Son exemple d'accusé `failed` ne le porte pas (le message de l'exemple n'en
   avait pas). C'est une inférence, pas une garantie.
3. **La référence actuelle de l'envoi ne documente plus le champ.**
   [Message API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api)
   — vers laquelle redirige l'ancienne page — ne le liste pas dans `BaseMessageProperties`. Seul le
   [journal des changements](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog) en
   atteste encore : « *Added `biz_opaque_callback_data` field to free-form messages […]* » (2023-11-14, ce qui suppose
   le champ déjà accepté pour les gabarits) et « *Changed `biz_opaque_callback_data` character maximum from 256 to
   512.* » (2024-01-26). Aucune restriction de caractères n'est documentée.

**Conséquence.** Un appariement par jeton ne servirait sûrement que pour `sent`/`delivered`/`read` : il dirait d'un envoi
ambigu qu'il est parti, jamais (sur la foi de la documentation) qu'il a échoué — or AC1 porte sur `failed`. Écrire le
code sur l'inférence du point 2, c'est le pari que B3 refuse, déplacé de l'appariement vers la documentation.

**Pour reprendre ce ticket** (prérequis hors code du porteur, compte Meta du Radar) : envoyer un gabarit avec
`biz_opaque_callback_data` vers un destinataire qui échoue (numéro hors WhatsApp, par exemple), et relever si l'accusé
`failed` reçu porte le champ. S'il le porte, AC1 tient sur une mesure ; sinon, réécrire AC1 sur `delivered`/`read`
seulement (un envoi ambigu dont l'arrivée est prouvée), ou clore le ticket comme caduc. Le jeton, quand il sera posé,
sera un identifiant aléatoire non devinable propre à la ligne : jamais un numéro ni une donnée personnelle.

### Décisions prises en autonomie, à revoir

- **Retenu** : ne rien implémenter, ticket `todo` avec ce constat. **Écarté** : implémenter sur la référence actuelle
  des accusés (point 2). **Raison** : la consigne A5 exige une garantie pour `failed`, que seule une inférence donne.
- **Retenu** : pas de ticket de suite (TCK-2442 reste libre). **Écarté** : un ticket « mesurer l'accusé `failed` ».
  **Raison** : cette mesure est la condition de reprise de ce ticket même ; un second ticket dupliquerait le delta.
