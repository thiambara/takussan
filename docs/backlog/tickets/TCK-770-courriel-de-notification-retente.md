---
id: TCK-770
title: "Le courriel de notification est retenté : l'échec n'est avalé qu'à la dernière tentative"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-14--observabilité--ce-quon-ne-verrait-pas-en-production"
tags: [back, notifications, file, pistes]
---

## Contexte

Réf : **P14.06** du fichier de pistes, `retenu · autonome` (A1). `SendRawNotificationEmailJob`
déclare `$tries = 3` et un `backoff`, et son commentaire promet que les échecs transitoires sont
retentés avant d'être avalés à la dernière tentative. Mais le `catch (\Throwable)` attrapait chaque
tentative : le job finissait réussi au premier échec, jamais retenté.

## Objectif

Le comportement que le commentaire écrit : relever tant qu'il reste une tentative, avaler (et
rapporter) à la dernière.

## Delta à produire

- [x] `handle()` relève l'erreur quand `attempts() < $tries`, hors file `sync`.
- [x] Sur la file `sync` (une seule tentative, dans l'appelant), l'erreur reste avalée et
      rapportée, comme avant.

## Critères d'acceptation

- [x] AC1 — Tentative 1 sur 3 : l'exception sort du job (le worker le retente).
- [x] AC2 — Tentative 3 sur 3 : rien ne sort, l'exception est rapportée.
- [x] AC3 — File `sync` : l'appelant ne voit pas l'échec, qui est rapporté.

## Hors périmètre

- `report($e)` journalise `getMessage()`, qu'ADR-0044 écarte (un refus SMTP peut y recopier
  l'adresse) : même famille que P14.09, laissé tel quel ici.

## Notes d'implémentation

- Ablation : relance retirée → AC1 rouge ; garde `SyncJob` retirée → AC3 rouge (l'échec remonte
  dans l'appelant, `attempts()` valant 1 sur la file `sync`) ; remis → 3 verts.
