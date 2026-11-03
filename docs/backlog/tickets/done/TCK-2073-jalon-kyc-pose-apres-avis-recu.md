---
id: TCK-2073
title: "Le jalon de relance KYC ne se pose qu'après un avis reçu par un administrateur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#42-kycdossier-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-207--rappels-planifiés-par-code-marqués-à-la-mise-en-file-face-à-un-envoi-perdu"
tags: [api, kyc, notifications, pistes]
---

## Objectif

`KycExpiryService` ne pose le jalon dans `metadata.expiry_reminders`, et ne compte `reminded`,
qu'après qu'au moins un administrateur de l'agence a reçu l'avis.

## Contexte

Réf : **P207.04** du fichier de pistes, `validé (délégué)`.

### Décision du porteur (déléguée)

> validé (délégué) — ne poser le jalon KYC dans `expiry_reminders` qu'après qu'au moins un administrateur a reçu l'avis, et ne compter `reminded` que pour un rappel parti ; garde : agence sans administrateur joignable → `reminded` = 0, jalon non posé, puis un administrateur ajouté → le rappel part au passage suivant ; reste : le seau de 5 SMS par heure et par numéro, à mesurer d'abord comme l'écrit la `Piste`

- `remind()` posait le jalon avant de boucler sur `AdminsDeLAgence::destinataires()`, et rendait
  `true` sans condition : une agence sans administrateur joignable perdait J-30 sans avis.

## Reste à faire

- le seau de 5 SMS par heure et par numéro, à mesurer d'abord comme l'écrit la `Piste`

## Hypothèses (mode sans humain)

- « Reçu » se lit sur le retour de `NotificationService::send()` : la ligne de cloche écrite (un
  compte non joignable rend `null`).
- Le jalon se pose après la boucle : un envoi qui lève au milieu laisse le jalon libre, et le
  passage suivant relance tout le monde. C'est l'ordre que la décision demande.

## Delta à produire

- [x] `KycExpiryService::remind()` : envois d'abord, jalon posé et `true` rendu seulement si au
  moins un avis est reçu.
- [x] `KycDossierExpiryTest` : agence au seul administrateur bloqué, puis un administrateur ajouté.

## Critères d'acceptation

- [x] AC1 — Agence sans administrateur joignable → `run()` rend `reminded` = 0, jalon non posé.
- [x] AC2 — Un administrateur ajouté → le rappel part au passage suivant, jalon `[30]` posé.
- [x] AC3 — Les relances J-30 / J-7 existantes restent uniques par jalon.

## Hors périmètre

- Le seau SMS (reste ci-dessus).

## Notes d'implémentation

- Avant correctif : `run()` rend `reminded` = 1 et pose `[30]` sans aucun avis.
- Ablation : la sortie « aucun avis reçu » neutralisée → 1 rouge ; remise → 4 verts.
