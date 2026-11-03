---
id: TCK-1258
title: "Journal des webhooks : `event_type` borné à sa colonne, comme `external_id`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-124--colonnes-bornées-remplies-par-une-valeur-dérivée-ou-recopiée"
tags: [api, webhooks, journal, colonnes-bornees, pistes]
---

## Contexte

Réf : **P124.04** du fichier de pistes, `retenu · autonome` (A1).

`WebhookJournal::annotate()` borne `external_id` à 191 caractères mais écrit `event_type` tel
quel dans un `varchar(255)`. `event_type` vient du corps du fournisseur (`deliveryStatus`
d'Orange, `type` d'un événement de paiement) : au-delà de 255 caractères, l'accusé rend 500.

## Objectif

`event_type` est borné à 255 caractères dans `annotate()`.

## Delta à produire

- [x] `WebhookJournal::annotate()` : `mb_substr((string) $facts['event_type'], 0, 255)`.
- [x] Test dans `WebhookJournalTest` : accusé Orange apparié dont le statut fait 300 caractères.

## Critères d'acceptation

- [x] AC1 — Accusé Orange au `deliveryStatus` de 300 caractères → 200, `event_type` de 255
      caractères au journal.

## Hors périmètre

- Une garde générale des écritures dérivées face à la longueur de leur colonne : le constat la
  relève comme manquante, la piste ne la demande pas.

## Notes d'implémentation

- Ablation : `WebhookJournal.php` remis à `HEAD` → 1 rouge (500) ; correctif remis → 11/11 verts.
