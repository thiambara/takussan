---
id: TCK-2435
title: "Socle IA : le masqueur ne lit plus `RDC+1` ni `R + 1` d'une annonce comme un indicatif"
status: doing
phase: P1
family: technique
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2428]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
  models: []
tags: [api, ia, socle-ia, donnees-personnelles, radar]
---

## Objectif utilisateur

Le porteur envoie au modèle une annonce qui écrit son étage `RDC+1` ou `R + 1`, sans que le prix qui suit soit
remplacé par `[TELEPHONE]` : le modèle lit le vrai prix.

## Contexte

Hors du périmètre de TCK-2428, qui n'exempte que `R+` suivi d'un ou deux chiffres que rien ne colle derrière
(`PhoneMasker::NOT_A_FLOOR`, miroir `PAS_UN_ETAGE` dans `scripts/check-ai-evals-pii.mjs`). Mesuré sur la branche de
TCK-2428 (numéros fictifs) :

- `Immeuble RDC+1 1 250 500 750 F` est masqué en `Immeuble RDC[TELEPHONE] F` : `+1` suivi de dix chiffres ;
- `Immeuble R + 1 1 250 500 750 F` est masqué en `Immeuble R [TELEPHONE] F` : le `+` admet une ou deux espaces derrière lui.

Dans les deux cas, `RadarAmountParser` ne rend aucun prix, puisque `RadarPhone::withoutFloorPlus()` ne neutralise que `R+`
collé.

## Contrat de données

Aucun endpoint, aucune migration. `App\Support\PhoneMasker` et son miroir `scripts/check-ai-evals-pii.mjs`, le
fixture partagé `tests/fixtures/ai/donnees-personnelles.json`, et `RadarPhone::withoutFloorPlus()` si le Radar doit
suivre.

## Contraintes strictes (métier)

- Le masqueur et la garde JS reconnaissent toujours le même ensemble (fixture partagé, parité rejouée sur les lignes
  distinctes du dépôt comme TCK-2410).
- Un numéro collé derrière l'étage (`RDC+33612345678`) reste masqué, comme `R+33612345678` depuis TCK-2428.
- `R + 33 6 12 34 56 78` est ambigu : le mesurer avant de choisir.

## Delta à produire

- [ ] Mesurer les écritures d'étage réellement rencontrées (`RDC+1`, `Rdc+1`, `R + 1`, `R +1`, `R+ 1`), puis étendre
      l'exemption côté PHP et côté JS.
- [ ] Fixture : `Immeuble RDC+1 1 250 500 750 F` et `Immeuble R + 1 1 250 500 750 F` en non-cas ;
      `RDC+33612345678` en forme avec contexte (`RDC[TELEPHONE]`).

## Critères d'acceptation

- [ ] AC1 — Les formes ci-dessus sont éprouvées des deux côtés (PHP et JS) par le fixture partagé.
- [ ] AC2 — Les formes existantes du fixture restent vertes.
- [ ] AC3 — Ablation de chaque garde nouvelle : rouge.

## Hors périmètre

- Les étages écrits en toutes lettres (« rez-de-chaussée plus un ») : rien ne les lit comme un numéro.

## Notes d'implémentation
