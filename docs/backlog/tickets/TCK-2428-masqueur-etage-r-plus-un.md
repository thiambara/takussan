---
id: TCK-2428
title: "Socle IA : le masqueur ne lit plus l'étage `R+10` d'une annonce comme un indicatif nord-américain"
status: todo
phase: P1
family: technique
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2412]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
  models: []
tags: [api, ia, socle-ia, donnees-personnelles, radar]
---

## Objectif utilisateur

Le porteur envoie au modèle une annonce qui écrit son étage `R+1`, `R+10` sans que le prix ou le numéro qui
suit soit remplacé par `[TELEPHONE]` : le modèle lit le vrai prix et le vrai contact.

## Contexte

Relevé par la vérification adverse de TCK-2412 (M1), numéros fictifs. `PhoneMasker::MASK_PATTERN`, branche
`FOREIGN`, exclut un chiffre ou un `+` devant le `+` d'un indicatif, pas une lettre. Donc :

- `Immeuble R+1 1 250 500 750 F` est masqué en `Immeuble R[TELEPHONE] F` : `+1` suivi de dix chiffres ;
- `Immeuble R+10 77 123 45 67` est masqué en `Immeuble R[TELEPHONE]` : `+1` puis `0 77 123 45 67`.

Le Radar (TCK-2412) neutralise déjà ce `+` de son côté (`RadarPhone::withoutFloorPlus()`, utilisé par
`RadarPhone` et `RadarAmountParser`). Le texte envoyé au modèle et les jeux d'évaluation, eux, perdent le prix
ou gardent un numéro mal découpé.

## Contrat de données

Aucun endpoint, aucune migration. `App\Support\PhoneMasker` et son miroir `scripts/check-ai-evals-pii.mjs`, le
fixture partagé `tests/fixtures/ai/donnees-personnelles.json`.

## Contraintes strictes (métier)

- Le masqueur et la garde JS reconnaissent toujours le même ensemble (fixture partagé).
- `Tel+33 6 12 34 56 78` (un `+` collé à un mot) reste masqué : seul l'étage `R+n` est exempté.
- Après le correctif, `RadarPhone::withoutFloorPlus()` peut rester (défense en profondeur) ou être retiré :
  le décider au moment de l'implémentation.

## Delta à produire

- [ ] `FOREIGN` n'admet pas un `+` précédé d'un `R`/`r` isolé suivi d'un chiffre (ou la même neutralisation
      que `RadarPhone::withoutFloorPlus()`), côté PHP et côté JS.
- [ ] Fixture : `Immeuble R+1 1 250 500 750 F` et `Villa R+2 85 000 000 F` en non-cas ;
      `Immeuble R+10 77 123 45 67` en forme avec contexte (`Immeuble R+10 [TELEPHONE]`).

## Critères d'acceptation

- [ ] AC1 — Les formes ci-dessus sont éprouvées des deux côtés (PHP et JS) par le fixture partagé.
- [ ] AC2 — Les formes existantes du fixture restent vertes.
- [ ] AC3 — Ablation de chaque garde nouvelle : rouge.

## Hors périmètre

- Les autres notations d'étage (`RDC+1`) : à mesurer d'abord.

## Notes d'implémentation
