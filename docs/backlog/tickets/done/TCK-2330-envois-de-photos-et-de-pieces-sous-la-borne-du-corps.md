---
id: TCK-2330
title: "Photos d'intervention et d'état des lieux bornées à 20, photos de clôture une à une, somme des pièces jugée sous la borne du corps"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-222--photos-et-pièces-téléversées-hors-de-mediamanager-et-mediadropzone"
tags: [api, front, maintenance, inventory, leases, i18n, pistes]
---

## Objectif utilisateur

Le prestataire ou le gestionnaire qui joint des photos à une intervention, à un état des lieux ou
à sa clôture, et celui qui joint des pièces à un devis ou à une restitution de caution, n'envoie
jamais un lot que l'image de l'API ampute en silence (`max_file_uploads = 20`) ou refuse en 413
sans corps (borne de 25 Mio du proxy) : la borne se dit au choix, ou l'envoi tient par
construction sous la borne.

## Contexte

Réfs : **P222.02** et **P222.05** du fichier de pistes, toutes deux `validé`.

- P222.02 — `photos` n'a pas de `max:` dans `UploadPhotosMaintenanceRequestRequest`,
  `CompleteMaintenanceRequestRequest` et `UploadRoomPhotosInventoryRequest`, alors que l'image
  ignore sans erreur le 21e fichier (`docker/php.ini`, `max_file_uploads = 20`) et que le proxy
  refuse tout corps de plus de 26 214 400 octets (`docker/Caddyfile`). La clôture envoyait toutes
  ses photos dans le seul corps de `PUT …/complete` : 19 photos réduites (TCK-542) le dépassent.
- P222.05 — le devis admet cinq pièces de 5 Mo (`SubmitQuoteRequest`, TCK-1907) :
  5 × 5 Mio = 26 214 400 octets, la borne même du proxy, que les lignes du devis franchissent.

## Décision du porteur

P222.02 :

> validation du porteur (2026-10-25) : `max:20` sur les trois règles de photos ; les photos de clôture partent une à une par `/photos` (`completion_photos`) avant `/complete`, arrêt au premier échec

P222.05 :

> validation du porteur (2026-10-25) : la somme des pièces d'un devis jugée au front sous la borne du corps moins une marge, par une constante commune avec `DepositRefundModal`

## Hypothèses

- La marge est de 1 Mio : la somme admise est 24 Mio (25 Mio − 1 Mio), le chiffre que la
  recommandation du délégué donnait en exemple. Les champs d'un devis ou d'une restitution pèsent
  quelques Ko ; la marge couvre aussi l'enveloppe multipart.
- La constante commune (`src/lib/borne-du-corps.ts`) s'applique à `DepositRefundModal` comme au
  devis : c'est ce que « commune » demande. Elle juge donc aussi la somme des pièces d'une
  restitution (trois pièces de 9 Mo sont refusées), ce qui couvre la moitié « borne de la somme »
  du reste de P222.04 (TCK-2148). L'autre moitié de ce reste, l'alignement de `uploads` de l'API,
  n'est pas touchée.
- Une sélection qui porterait la somme au-delà est refusée **entière** et dite, comme une
  sélection qui dépasse le nombre (TCK-1889, TCK-2148) : choisir lesquelles garder n'est pas au
  front. Les pièces déjà choisies du devis restent.
- Une photo de clôture jointe sort de la sélection : si une photo suivante ou `/complete` échoue,
  réessayer n'envoie que ce qui n'est pas encore joint, sans doublon.
- `PUT …/complete` garde sa règle `photos` (`max:20` désormais) : l'API accepte toujours des
  photos à la clôture, le front n'en envoie plus par là. `useCompleteMaintenanceRequest` ne prend
  plus de photos.
- Les autres écrans d'envoi de photos (`MaintenanceForm`, `MaintenanceGallery`, l'état des lieux)
  ne changent pas au front : la décision ne porte que sur les règles et sur la clôture.

## Delta à produire

- [x] `photos` `max:20` dans les trois FormRequest.
- [x] `MaintenanceCompleteForm` : chaque photo par `/photos` (`completion_photos`), puis
  `/complete` sans photo ; arrêt au premier échec.
- [x] `src/lib/borne-du-corps.ts` : borne du proxy, marge, somme admise, `piecesDepassentLeCorps`.
- [x] `QuoteSubmitForm` et `DepositRefundModal` jugent la somme par cette constante.
- [x] Clés `maintenance.intervention.quote_form.total_too_large` et
  `lease.deposit.modal.total_too_large` en `fr`, `en`, `wo` (le `wo` porte le français).

## Critères d'acceptation

- [x] AC1 — 21 photos à `/photos`, à `/complete` et à `/room-photos` → 422 sur `photos`, aucun
  média écrit, la demande reste `in_progress` (`PhotoBatchCapTest`).
- [x] AC2 — Le prestataire assigné joint ses photos de clôture une à une par `/photos`
  (`completion_photos`), puis termine (`PhotoBatchCapTest`, témoin du chemin du front).
- [x] AC3 — Deux photos choisies à la clôture : deux appels `/photos` d'une photo chacun, avant
  `/complete`, qui n'en porte aucune.
- [x] AC4 — Le deuxième envoi échoue : `/complete` n'est pas appelé, l'erreur s'affiche, et
  réessayer n'envoie que les photos non jointes.
- [x] AC5 — `/complete` échoue après les photos : réessayer ne les renvoie pas.
- [x] AC6 — Cinq pièces de 5 Mo au devis sont refusées ensemble, avec « 24 Mo » ; une cinquième
  qui ferait passer la somme au-delà est refusée, les quatre premières restent.
- [x] AC7 — Trois pièces de 9 Mo à la caution sont refusées ensemble, dites, et aucune ne part.

## Hors périmètre

- La borne annoncée au front des autres écrans de photos d'intervention et l'envoi par photo de
  la galerie et de l'état des lieux (non demandés par la décision).
- L'alignement de `uploads` de l'API de la caution (reste de P222.04).
- Une garde qui comparerait la constante au `Caddyfile` : un test du front qui lit
  `takussan-api/docker/Caddyfile` demande d'ajouter ce chemin aux déclencheurs de `web-ci.yml`.

## Notes d'implémentation

- Ablation API : `max:20` retiré des trois règles → les trois tests de borne de `PhotoBatchCapTest`
  rouges (200 ou 201 au lieu de 422), le témoin vert ; remis → 4/4.
- Ablation clôture : l'ancien `MaintenanceCompleteForm` remis → les trois tests d'envoi rouges ;
  le seul retrait de la photo jointe de la sélection supprimé → les deux tests de reprise rouges.
- Ablation somme : `piecesDepassentLeCorps` rendu toujours faux → les trois tests de somme des deux
  écrans rouges ; remis → verts.
