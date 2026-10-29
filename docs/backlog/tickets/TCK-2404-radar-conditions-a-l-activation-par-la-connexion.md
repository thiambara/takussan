---
id: TCK-2404
title: "Radar : le compte créé par le Radar et activé par la connexion ordinaire se voit présenter les conditions"
status: todo
phase: P1
family: full
estimate: S
wave: 80
created: 2026-10-29
updated: 2026-10-29
depends_on: [TCK-2390]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
    - "docs/features.md#21-authentification--comptes"
  models: []
tags: [api, front, radar, onboarding, legal, adr-0077, adr-0033]
---

## Objectif utilisateur

L'annonceur dont le Radar a publié les annonces pour lui, et qui active son compte en se connectant
par code SMS depuis `/auth/login` plutôt que par le lien du message, accepte les conditions
d'utilisation à ce moment-là, comme l'article 6.3 des CGU le lui promet.

## Contexte

Relevé pendant TCK-2390 (2026-10-29). L'article 6.3 de `takussan-web/src/content/legal/terms.ts` dit :
« Vous l'activez en vous connectant avec un code reçu par SMS à ce numéro ; les présentes Conditions
vous sont alors présentées pour acceptation. » TCK-2390 le rend vrai sur **la page de réclamation**
(`/[locale]/claim/{jeton}` : case des conditions, `PublishReadiness::recordTerms` à la confirmation,
version comprise). Mais la connexion par téléphone ordinaire (`POST /api/auth/phone/verify-code`)
ouvre aussi ce compte (amendement d'ADR-0033 §3, TCK-2389), sans rien présenter : les conditions ne
sont enregistrées qu'à la première publication faite par l'utilisateur lui-même
(`PropertyController`, `accept_terms`). Mesuré : `grep -rn recordTerms takussan-api/app` — quatre
appels dans `PropertyController`, un dans `RadarClaims`, aucun dans la connexion.

## Delta à produire

- [ ] À la première connexion d'un compte du Radar (`is_new_account` faux, compte désigné par un
      `radar_advertisers.user_id`, `terms_accepted_at` nul), les conditions sont présentées pour
      acceptation avant l'entrée dans l'espace, et leur acceptation enregistrée avec leur version.
- [ ] Retirer la ligne « Fermer TCK-2404 » de « Avant la mise en production » du `README` de
      `content/legal`.

## Critères d'acceptation

- [ ] AC1 — Un compte du Radar activé par `/auth/login` (code SMS) ne voit pas son espace avant
      d'avoir accepté les conditions ; l'acceptation porte `terms_version`.
- [ ] AC2 — Un compte qui a déjà accepté (réclamation, ou publication) n'est pas interrogé de nouveau.

## Hors périmètre

- La page de réclamation elle-même (TCK-2390, livrée).

## Notes d'implémentation

_(à remplir par implementing-specs)_
