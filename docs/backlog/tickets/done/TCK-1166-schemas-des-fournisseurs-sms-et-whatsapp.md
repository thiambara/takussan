---
id: TCK-1166
title: "Les fournisseurs SMS et WhatsApp demandent à la console les identifiants que leur pilote lit"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-98--écrans-décriture-de-la-console-super-admin--ce-quils-changent-hors-de-la-console"
tags: [back, integrations, sms, whatsapp, super-admin, pistes]
---

## Contexte

Réf : **P98.06** du fichier de pistes, `validé` (V7 accordé : les formulaires de la console
changent).

Décision du porteur : « validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

`sms_orange`, `sms_mtarget`, `sms_lafricamobile` et `whatsapp_cloud` étaient servis par le schéma
générique : un `api_key` obligatoire que nul pilote ne lit. L'écran ne rend que les champs du
schéma : aucun identifiant réel ne se saisissait depuis la console.

## Objectif utilisateur

Un super-admin configure depuis la console les identifiants qu'un envoi SMS ou WhatsApp utilise.

## Delta à produire

- [x] `GenericProvider` : un schéma propre aux quatre fournisseurs de messagerie, tiré des clés
      que leur pilote lit dans `credentials` ; obligatoires, celles sans lesquelles il n'envoie rien.
- [x] `MessagingDriverCredentialsTest` : chaque clé `$creds['…']` du source du pilote est un champ
      du schéma, et chaque champ est lu par le pilote.

## Critères d'acceptation

- [x] AC1 — Orange : `client_id`, `client_secret`, `sender_address` obligatoires, `sender_name`
      facultatif ; Mtarget : `username`, `password` obligatoires, `service_id`, `sender_id`
      facultatifs ; LAfricaMobile : `accountid`, `password` obligatoires, `host`, `sender_id`
      facultatifs ; WhatsApp Cloud : `phone_number_id`, `access_token` obligatoires.
- [x] AC2 — `api_key` n'est plus demandé à ces quatre fournisseurs.
- [x] AC3 — les champs secrets (`client_secret`, `password`, `access_token`) sont masqués.

## Hors périmètre

- `mailgun` : aucun pilote ne lit son intégration (l'envoi lit `MAIL_*`), il garde le schéma
  générique ; c'est l'objet de P98.07.
- L'édition de `metadata` à l'écran (reste) : chaque clé que les pilotes lisent en métadonnée
  (`sender_address`, `sender_name`, `sender_id`, `host`) est aussi lue en identifiant, et se
  saisit donc par le schéma.
- Un « Test » qui contacte le fournisseur.
- Les lignes `integrations` déjà enregistrées : rien n'est réécrit. Une ligne qui n'a que
  `api_key` ressort « identifiants manquants » au test, ce qu'elle était pour le pilote.

## Notes d'implémentation

- Choix : la voie de la piste (schéma propre tiré des clés du pilote), sans l'édition de
  `metadata` (voir Hors périmètre). Les champs obligatoires suivent le pilote, pas la
  recommandation du délégué : Mtarget n'ajoute `serviceid` que s'il est rempli, `service_id` reste
  donc facultatif.
- L'écran n'a pas changé : il rend les champs et les libellés que l'API sert.
- Ablation : `GenericProvider.php` rendu à `pre-dev` → 3 rouges sur 3 ; correctif remis → 3/3.
  `IntegrationStoreValidationTest`, `IntegrationMetadataEditTest`, `HealthcheckProbesTest`,
  `IntegrationAdminTest`, `ImpersonationReadOnlyTest` verts.
