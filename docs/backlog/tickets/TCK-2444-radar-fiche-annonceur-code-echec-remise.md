---
id: TCK-2444
title: "Radar : dire dans la fiche annonceur pourquoi WhatsApp n'a pas remis un message (code de l'échec)"
status: done
phase: P3
family: full
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2437]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models:
    - "docs/models-spec.md#110-radaroutreach-"
tags: [api, front, radar, whatsapp, adr-0081]
---

## Objectif utilisateur

Devant un message « Non remis », l'opérateur du Radar sait si l'échec tient au numéro (il n'est pas sur WhatsApp) ou à
une limite passagère de Meta, pour juger de la suite sans ouvrir le journal d'activité.

## Contexte

TCK-2437 affiche l'état de remise d'un message envoyé par l'API (envoyé, remis, lu, non remis). Le code de l'échec que
Meta rend (`131026` : non remis, `131049` : limité par Meta…) n'est tenu que dans le journal d'activité
(`radar_whatsapp_delivery_failed`, propriété `provider_error_code`, `RadarWhatsappReceipts`) : `RadarOutreachResource`
ne le rend pas, et aucune colonne de `radar_outreaches` ne le porte. TCK-2437 a choisi de ne pas ajouter cette lecture
(son contrat de données demandait de le signaler d'abord) : ce ticket la propose.

## Contrat de données

- À trancher : une colonne `radar_outreaches.provider_error_code` (entier, nullable) écrite par `RadarWhatsappReceipts`
  avec le statut `failed`, ou une lecture du journal d'activité par la fiche. La colonne est plus simple à lire et ne
  porte, comme le journal, que le code : jamais le texte de l'erreur (il peut citer le numéro).
- `RadarOutreachResource` rend le code (ou un code de libellé dérivé), `null` hors échec.

## Contraintes strictes (métier)

- Seul le code de Meta est rendu : ni `title`, ni `message`, ni `error_data`.
- Un échec reste un message envoyé dont l'opérateur juge la suite : aucun renvoi automatique, aucun geste proposé.
- Libellés par next-intl (`fr`, `en` ; `wo` porte le texte français tel quel tant que le wolof est en pause) ; un code
  inconnu s'affiche par un libellé générique.

## Critères d'acceptation

- [x] AC1 — Un message `failed` avec un code connu affiche, près de « Non remis », le motif lisible de ce code.
- [x] AC2 — Un code inconnu ou absent affiche « Non remis » sans motif inventé.
- [x] AC3 — Aucune réponse de l'API ne rend le texte de l'erreur de Meta.

## Hors périmètre

- Une alerte ou une notification sur un échec de remise.
- Un renvoi, automatique ou proposé.

## Notes d'implémentation

- Colonne `radar_outreaches.provider_error_code` (entier, nullable), écrite par `RadarWhatsappReceipts` avec le statut
  `failed` (null si Meta ne rend pas de code) ; tout autre statut écrit la remet à null. `RadarOutreachResource` ne la
  rend qu'avec `provider_status = failed`. Le journal d'activité garde son code comme avant.
- **Aucune transition ne fait quitter `failed`** : `RadarWhatsappReceipts::advances()` refuse tout statut après lui
  (test `test_rien_ne_fait_quitter_failed_et_le_code_reste`). La remise à null ne sert donc qu'à garantir qu'aucun code
  ne reste à côté d'un autre statut si cette règle change.
- Front : `motifDeLEchec()` (`reponses.ts`) dérive la clé `deliveryFailure.code<code>` des seuls codes de
  `CODES_D_ECHEC_LIBELLES` ; le motif s'affiche juste après la pastille « Non remis », sur le suivi et dans l'historique.
- Codes libellés d'après la page « Error codes » de la Cloud API
  (https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/, lue le 2026-10-30).

### Décisions prises en autonomie, à revoir

- **Codes libellés** : retenu six codes dont la doc de Meta donne le sens et qui touchent la remise d'un gabarit
  (131026, 131049, 131050, 131056, 131048, 130472) ; écarté « les deux du minimum seulement » : plus d'information
  pour l'opérateur, aucun motif inventé. 131047 (fenêtre de 24 h) écarté : le Radar n'envoie que des gabarits ;
  130429 (débit de la Cloud API atteint) écarté : c'est une limite de l'appel d'envoi, non documentée comme motif
  d'un accusé `failed` ; il s'ajoute s'il apparaît au journal. Ajouter un code = une valeur de
  `CODES_D_ECHEC_LIBELLES` et une clé par dictionnaire.
- **Où s'affiche le motif** : retenu le suivi ET l'historique (partout où « Non remis » s'affiche) ; écarté la carte du
  suivi seule, l'AC1 dit « près de Non remis ».
- **Échecs antérieurs à la migration** : retenu aucune reprise depuis le journal d'activité ; écarté une migration de
  données. L'API du Radar n'a jamais servi en production, aucune ligne à reprendre ; une reprise reste possible plus
  tard à partir de `radar_whatsapp_delivery_failed`.
