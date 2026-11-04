---
id: TCK-2436
title: "Radar : appariement exact des accusés d'un envoi WhatsApp ambigu, par biz_opaque_callback_data"
status: done
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

- [x] Vérifier dans la documentation de Meta, avant toute écriture, que `biz_opaque_callback_data` est accepté pour un
      message de gabarit et renvoyé dans les `statuses`. Fait : garanti pour `sent`/`delivered`/`read`, pas pour
      `failed` (« Constat du 2026-10-30 » ci-dessous).
- [x] Poser un jeton aléatoire par message avant l'envoi (`RadarCloudWhatsappDriver`), le garder sur la ligne
      (`provider_callback_token`), et apparier par lui un accusé dont l'identifiant est inconnu ; l'identifiant de Meta
      est alors écrit sur la ligne.
- [x] `RadarWhatsappReceiptGuardTest` reste vert : jamais d'appariement par inférence (et B3 ajouté).

## Critères d'acceptation

AC1 réécrit le 2026-10-30 (décision de la session, à revoir par le porteur) sur les statuts que la documentation de
Meta garantit ; l'original portait sur `failed` seul.

- [x] AC1 — Un accusé `sent`, `delivered` ou `read` portant le jeton d'un envoi `ambiguous` sans identifiant, adressé
      au numéro de son annonceur, le rattache exactement : l'identifiant de Meta est écrit sur la ligne et le statut
      avance. Un `failed` qui porte le jeton fait de même (passe à `failed`) ; sans jeton, il reste ignoré.
      — `RadarWhatsappReceiptCallbackTest::test_ac1_*`
- [x] AC2 — Un accusé sans jeton, au jeton inconnu, au jeton d'un envoi déjà identifié, manuel ou jamais parti, d'un
      autre destinataire ou d'un annonceur purgé n'est rattaché à rien ; rejouer un jeton ne rattache rien.
      — `RadarWhatsappReceiptCallbackTest::test_ac2_*`, `RadarWhatsappReceiptGuardTest::test_b3_*`
- [x] AC3 — Chaque envoi par l'API transmet un jeton aléatoire de 40 caractères hexadécimaux, sans donnée
      personnelle, gardé sur la ligne, y compris sur un envoi ambigu et sur la reprise d'une écriture défaite.
      — `RadarWhatsappOutreachTest::test_ac3_*`

## Hors périmètre

- Renvoyer automatiquement un message dont l'envoi a échoué : l'opérateur juge.

## Constat du 2026-10-30

Vérification préalable (décision A5 du porteur) faite dans la documentation de Meta **avant toute écriture** : elle ne
garantit pas ce dont l'AC1 d'origine (`failed`) dépendait. Premier rendu : rien implémenté, ticket `todo`. La session a
ensuite décidé d'implémenter sur ce que la documentation garantit (AC1 réécrit, voir « Notes d'implémentation »).

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

## Notes d'implémentation

- **Le jeton** : `bin2hex(random_bytes(20))`, écrit par `RadarWhatsappOutreach` sur la ligne préparée
  (`radar_outreaches.provider_callback_token`, index unique partiel) et **commité avant les verrous et l'appel**, puis
  relu sous le verrou et transmis par le pilote ; un essai refusé laisse le jeton, inerte, que l'essai suivant reprend.
  Jamais journalisé ni exposé ; la liste blanche de `WebhookPayloadRedactor` ne le garde pas dans la vue expurgée.
- **Correctif de la vérification (I-1)** : écrit d'abord avec les colonnes du canal, après l'appel, le jeton n'était
  sur aucune ligne quand `sent`/`delivered` arrivaient pendant l'appel (délai dépassé) : ces accusés étaient perdus.
  Commité avant, il fait trouver l'annonceur, dont le verrou fait attendre l'accusé jusqu'à la fin de l'envoi.
  `RadarWhatsappReceiptGuardTest::test_i1_*` le rejoue par une fibre (une connexion unique ne peut pas attendre un
  verrou), et `RadarWhatsappOutreachTest::test_ac3_le_jeton_est_commite_*` garde l'écriture hors de la transaction.
- **L'appariement** (`RadarWhatsappReceipts::ambiguousByToken()`) : l'identifiant d'abord, relu sous le verrou de
  l'annonceur ; puis le jeton, seulement pour un envoi de l'API, envoyé, sans identifiant, dont l'annonceur a pour
  numéro le `recipient_id` de l'accusé, et si l'identifiant de Meta n'est porté par aucune ligne.
- **Amendement daté d'ADR-0081** (2026-10-30) : la règle « jamais rattaché » de TCK-2427 admet l'appariement exact.

## Prérequis du porteur

- Sur le compte Meta du Radar : envoyer un gabarit (il porte désormais `biz_opaque_callback_data`) vers un destinataire
  qui échoue (numéro hors WhatsApp, par exemple) et relever si l'accusé `failed` porte le champ. **S'il le porte, rien
  à changer dans le code** ; sinon, un `failed` d'envoi ambigu reste ignoré, comme avant ce ticket.
- Vérifier sur un vrai accusé que `recipient_id` est bien le numéro (et non un identifiant propre à l'entreprise,
  « business-scoped user ID », que Meta introduit) : sinon l'appariement ne se fait pas, sans rien rattacher à tort.

### Décisions prises en autonomie, à revoir

- **Retenu** : implémenter sur `sent`/`delivered`/`read` (garantis) et apparier un `failed` s'il porte le jeton.
  **Écarté** : ne rien implémenter (premier rendu). **Raison** : décision de la session, moins restrictive ; aucune
  perte par rapport à TCK-2427.
- **Retenu** : jeton aléatoire gardé en colonne. **Écarté** : jeton signé dérivé de l'id (sans migration).
  **Raison** : ne dépend pas d'`APP_KEY`, dont la rotation rendrait muets les accusés en vol.
- **Retenu** : exiger que `recipient_id` soit le numéro de l'annonceur. **Écarté** : le jeton seul. **Raison** :
  consigne de la session (un jeton rejoué ou d'un autre destinataire ne rattache rien) ; le coût est un appariement
  manqué si Meta rend un identifiant d'utilisateur à la place du numéro.
- **Retenu** : pas de ticket de suite (TCK-2442 reste libre). **Écarté** : un ticket « mesurer l'accusé `failed` ».
  **Raison** : la mesure est un prérequis du porteur sans code à écrire si elle confirme.
