---
id: TCK-2025
title: "Fiche client, recherche de la console et formulaires publics normalisent un téléphone saisi par le même code"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-125--téléphones-écrits-sans-normalisation-et-leurs-lecteurs"
tags: [api, telephone, crm, recherche, pistes]
---

## Objectif utilisateur

Un même numéro saisi de la même façon donne le même numéro rangé, qu'il soit tapé sur la fiche
client, dans la recherche de la console ou dans un formulaire public (visite, contact,
invitation) : la recherche retrouve ce que la fiche a rangé, et un fixe en `30` est accepté
partout comme sur la fiche client.

## Contexte

Réf : **P125.05** du fichier de pistes.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : fondre seulement les trois normaliseurs de saisie (`CustomerPhoneNormalizer`, `AdminGlobalSearchService::phoneCandidate`, `TelephoneSaisi`) sur `TelephoneSaisi::normaliser`, sans toucher `CanonicalPhone` ni `PhoneNumber::normalize` (ni index, ni migration) ; `TelephoneSaisi` accepte l'indicatif `30`, comme la fiche client

## Hypothèses (mode sans humain)

- `CustomerPhoneNormalizer::normalize` garde ce qui lui est propre : `null` pour une saisie vide, et
  la saisie rendue telle quelle (bords retirés) quand elle n'aboutit pas à un E.164 — c'est ce que
  lit `crm:normalize-customer-phones --dry-run`.
- `phoneCandidate` garde son contrat : un E.164 (`PhoneNumber::normalize`) ou `null`. Conséquence
  de la fusion : la recherche ne devine plus `+221` devant un national hors des indicatifs de
  `TelephoneSaisi` (70, 75-78, 30, 33) ; `72 123 45 67` n'est plus un candidat, comme il ne l'est
  pas pour la fiche client.
- Le `+` devant un fixe `30` nu est un indicatif manquant, comme devant le `33`.

## Delta à produire

- [x] `TelephoneSaisi` : indicatif `30` dans `NATIONAL_SENEGAL` et `INDICATIF_MANQUANT`.
- [x] `CustomerPhoneNormalizer::normalize` et `AdminGlobalSearchService::phoneCandidate` passent par
  `TelephoneSaisi::normaliser`.
- [x] Garde : une même table de saisies jouée contre les trois points d'entrée
  (`tests/Unit/Support/TelephoneSaisiTest.php`).

## Critères d'acceptation

- [x] AC1 — `30 123 45 67`, `77/123/45/67`, `77 123 45 67`, `33 820 12 34`, `+221 77-123-45-67`,
  `00221771234567`, `221771234567` rendent le même E.164 par les trois points d'entrée, que la règle
  accepte.
- [x] AC2 — `+30 123 45 67` est refusé (indicatif manquant) ; `+221301234567` ne reçoit pas de SMS.

## Hors périmètre

- `CanonicalPhone` (expression de l'index `users_phone_verified_unique`) et `PhoneNumber::normalize`,
  exclus par la décision.

## Notes d'implémentation

- Reproduit sur `c7f6c4101` : `30 123 45 67` → `301234567` par `TelephoneSaisi` ; `77/123/45/67` →
  `null` par la recherche.
- Ablation : les trois fichiers remis → 3 rouges ; `TelephoneSaisi` seul remis → 2 rouges (le `30`).
  Rétabli → vert.
