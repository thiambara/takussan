---
id: TCK-2511
title: Réclamation Radar : refuser depuis le lien (« Ce n'est pas moi », « Ne plus me contacter ») et chiffre de demande du quartier
status: todo
phase: P1
family: back
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: [TCK-2512]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models:
    - "docs/models-spec.md#108-radaradvertiser-"
tags: [back, radar, consentement, audit-ux]
---

## Objectif utilisateur

L'annonceur contacté peut dire non sans effort depuis le lien du message, et, s'il hésite, apprend ce que la publication lui rapporte : combien de personnes cherchent dans son quartier.

## Contrat de données

1. **`POST /api/radar/claims/{token}/decline`** — public, sans code, sous son propre compteur par IP (même famille que `radar_claim_show`). Corps : `reason` ∈ `not_me`, `stop_contact`. Effet : **exactement celui d'un STOP** — le chemin existant de `RadarConsentWorkflow` (accord retiré, annonces non publiées purgées, `phone` effacé, `phone_hmac` conservé pour ne plus contacter ce numéro) ; le motif est journalisé pour le super-admin. Rend `200 { data: { status: 'declined' } }`. Un jeton déjà mort (expiré, STOP, révoqué) rend la même réponse que les autres routes pour un lien mort — aucune information de plus.
2. **`GET /api/radar/claims/{token}`** ajoute `demand` : `{ quarter, searches_30d }` — le nombre de recherches des 30 derniers jours dont le lieu est le quartier des annonces du lien, lu dans le journal des recherches (`SearchQueryStat`, ADR-0088) ; **`null` sous le seuil** `radar.claim.demand_min_searches` (config, défaut 50) ou quand les annonces n'ont pas de quartier commun.

## Direction UX / Artistique

Sans objet (back). Maquette servie : `/fr/playground/maquettes?p=revendication&a=a` (écrans « Vos annonces », « Ce n'est pas moi »).

## Contraintes strictes (métier)

- Le refus n'exige aucune connaissance que le lien ne donne pas : pas de code SMS, pas de compte.
- Un refus sur un lien **sous mandat** ou dont des annonces sont déjà publiées suit la règle du STOP existante (biens publiés retirés de la surface publique) — aucune règle neuve.
- Le chiffre est un compte de recherches, jamais de visiteurs, et il n'existe pas sous le seuil : pas de « 3 recherches » qui desservirait la promesse.
- Aucune donnée d'un tiers dans `demand` (ni requêtes, ni personnes).

## Delta à produire

- [ ] Route `radar.claims.decline` + FormRequest + limiteur.
- [ ] Branchement sur le chemin du STOP de `RadarConsentWorkflow` (aucune seconde implémentation du retrait).
- [ ] `demand` dans la réponse de `show`, seuil en config (`radar.claim.demand_min_searches`) avec sa clé dans `.env.example` si elle est surchargeable.
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Après `decline`, le numéro n'est plus contactable par le Radar (même vérification que pour un STOP par message), et une nouvelle annonce de ce numéro n'ouvre pas de prise de contact.
- [ ] AC2 — Après `decline`, `GET …/{token}` répond comme pour un lien mort.
- [ ] AC3 — Avec 49 recherches sur le quartier et un seuil à 50, `demand` est `null` ; avec 50, il vaut 50.
- [ ] AC4 — `decline` n'appelle aucun envoi de SMS (vérifié par le faux pilote SMS).

## Hors périmètre

- La page de réclamation (TCK-2512).
- Un tableau de bord des refus pour le super-admin.

## Notes d'implémentation

_(à remplir par implementing-specs)_
