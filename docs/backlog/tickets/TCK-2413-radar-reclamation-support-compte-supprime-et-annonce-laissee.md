---
id: TCK-2413
title: "Radar : le super-admin délie le compte supprimé qui bloquait la réclamation, et l'annonce que la publication laisse à l'opérateur le dit"
status: doing
phase: P1
family: full
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2390, TCK-2391]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, support, public, adr-0077]
---

## Objectif utilisateur

L'annonceur dont le compte créé par le Radar a été supprimé peut de nouveau réclamer ses annonces,
une fois que le super-admin l'a délié ; et l'annonceur dont une annonce attend l'équipe le lit
honnêtement sur la page de réclamation, pendant que l'opérateur la trouve dans sa file.

## Contexte

Deux suites de [TCK-2390](TCK-2390-radar-reclamation-par-l-annonceur.md) (§ « Suites »),
[ADR-0077](../../adr/0077-le-radar.md) §3, §6, §11.

1. **Compte du Radar supprimé** : tant que `radar_advertisers.user_id` vise un compte A supprimé
   (doucement), `RadarClaims::state()` rend `support` si un compte B a vérifié le numéro (A n'est pas
   « jamais servi »), `unavailable` sinon (`AdvertiserProvisioner::accountUnavailable()`). Aucun outil
   du support ne remet ce champ à zéro : l'annonceur ne peut plus rien réclamer.
2. **L'annonce que le job laisse à l'opérateur** : `PublishClaimedRadarListings` laisse `consented`
   ce qu'il ne peut pas publier (aucune photo en réserve, champ requis manquant, refus de la
   publication) sans rien écrire. La page la range encore dans `publishing` — « en cours de
   publication » — et aucune file de la console ne la montre.

## Contrat de données

- `POST /api/admin/radar/advertisers/{advertiser}/release-account` — motif facultatif. Gardé par
  `super-admin` + `platform-can:platform.radar.publish`. Remet `user_id` à `null` si le compte
  rattaché est supprimé ; 409 sinon, ou si l'annonceur est révoqué (STOP, `do_not_contact`, accord
  retiré, numéro purgé). Journalisé (`radar_account_released`).
- Fiche annonceur (`GET /api/admin/radar/advertisers/{advertiser}`) : `account` (le compte rattaché,
  supprimé ou non, et si le geste est offert) et le `stage_reason` de chaque annonce.
- `filter[queue]=left_to_operator` sur `GET /api/admin/radar/advertisers`.
- `GET /api/radar/claims/{token}` : `awaiting_review`, les annonces réclamées que la publication a
  laissées à l'équipe, sorties de `publishing`.

## Contraintes strictes (métier)

- Le geste ne contourne jamais STOP, `do_not_contact` ni la révocation : il les refuse.
- Il ne délie qu'un compte **supprimé** ; un compte bloqué ou un espace suspendu reste une décision du
  support, que le geste ne défait pas.
- La page publique ne dit pas pourquoi l'annonce attend (rien du Radar interne) ; la console le dit.

## Delta à produire

- [ ] Service et route du geste, journalisé, avec sa garde de capacité.
- [ ] Fiche : `account`, `stage_reason` des annonces ; front : le geste et son dialogue.
- [ ] Job : chaque annonce qu'il laisse porte le code de la raison dans `stage_reason`, y compris
      quand sa fenêtre expire.
- [ ] File `left_to_operator` (API + onglet).
- [ ] Page de réclamation : `awaiting_review`, et son texte.

## Critères d'acceptation

- [ ] AC1 — Après le geste sur un annonceur dont le compte A est supprimé, la page de réclamation
      ne rend plus `support` (ni `unavailable`), et la réclamation aboutit ; le geste est journalisé.
- [ ] AC2 — Le geste est refusé (409) sur un annonceur révoqué, après STOP, ou dont le compte n'est
      pas supprimé ; sans `platform.radar.publish`, 403.
- [ ] AC3 — Une annonce que le job laisse (sans photo, champ manquant, refus) sort de `publishing`
      pour `awaiting_review` sur la page, et l'annonceur apparaît dans `left_to_operator`.

## Hors périmètre

- La relance d'activation et le mandat (TCK-2394).
- Un bien publié puis retiré par la modération : il n'est plus une annonce que le job laisse.

## Notes d'implémentation

_(à remplir par implementing-specs)_
