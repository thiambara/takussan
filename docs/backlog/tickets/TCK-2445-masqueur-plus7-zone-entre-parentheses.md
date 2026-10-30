---
id: TCK-2445
title: "Socle IA : un numéro `+7` à zone entre parenthèses ne part plus en clair derrière `RDC` ou un `R` espacé"
status: doing
phase: P1
family: technique
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2435]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, ia, socle-ia, donnees-personnelles, radar]
---

## Objectif utilisateur

Une annonce qui écrit un numéro russe ou kazakh à zone entre parenthèses derrière son étage
(`RDC +7 (495) 123-45-67 F`) part chez le fournisseur du modèle avec ce numéro masqué, comme avant TCK-2435.

## Contexte

Régression de TCK-2435 (PR #1612), relevée par une relecture adverse et reproduite sur `dev` c6d7731db (numéros
fictifs). Ces textes étaient masqués par le masqueur de 908d62321 ; ils partent en clair sur `dev` :

- `RDC +7 (495) 123-45-67 F`, `R + 7 (495) 123-45-67 F`, `R +7 (812) 123-45-67 XOF`, `RDC +7 (912) 345-67-89 F`,
  `RDC+7 (495)1234567 F`.

Cause : `PhoneMasker::CC7_REST` n'admet pas de zone entre parenthèses (`NANP_REST` l'admet), et la branche à
parenthèses de `CC1_REST` refuse toute marque monétaire derrière : le `7` est lu comme un étage. La garde JS
(`RESTE_CC7`) a le même trou. `RadarAmountParser` lit des bouts du numéro comme des prix (`1234567`, `495`, `67`).

## Contrat de données

Aucun endpoint, aucune migration. `App\Support\PhoneMasker` et son miroir `scripts/check-ai-evals-pii.mjs`, le fixture
partagé `tests/fixtures/ai/donnees-personnelles.json`, `RadarPhone::FLOOR_PLUS` (qui lit `PhoneMasker::CC1_NUMBER` et
`FLOOR_AFTER_PLUS`), `App\Services\Radar\RadarAmountParser`.

## Contraintes strictes (métier)

- Le masqueur et la garde JS reconnaissent toujours le même ensemble (fixture partagé, parité rejouée sur les lignes
  distinctes du dépôt).
- Aucune ligne masquée par le masqueur de 908d62321 ne sort en clair, sauf les écritures d'étage suivies d'un prix que
  TCK-2435 a voulu rendre lisibles.

## Delta à produire

- [ ] Derrière `7`, la zone entre parenthèses `([3-9]XX)` dans `CC7_REST` (PHP) et `RESTE_CC7` (JS) ; le Radar suit
      par `CC1_NUMBER`.
- [ ] Fixture : chaque exemple ci-dessus, et ses variantes à points, barres et espaces insécables, en `avec_contexte`.
- [ ] Radar : ces numéros ne sont ni des prix ni des contacts sénégalais.
- [ ] m11 : mesurer si `R+ 2 450 000 F` (étage espacé) donnait déjà 2 450 000 avant TCK-2435, puis corriger ou décrire.

## Critères d'acceptation

- [ ] AC1 — Les cinq exemples du contexte et leurs variantes sont masqués des deux côtés (PHP et JS), éprouvés par le
      fixture partagé.
- [ ] AC2 — `RadarAmountParser` ne rend aucun prix et `RadarPhone` aucun contact pour ces textes.
- [ ] AC3 — Parité PHP/JS : 0 écart ; face au masqueur de 908d62321, aucune ligne masquée ne sort en clair hors des
      étages suivis d'un prix (liste dans le rapport).
- [ ] AC4 — Ablation de chaque correctif : rouge.

## Hors périmètre

- Une zone de quatre ou cinq chiffres entre parenthèses (`+7 (3452) 12-34-56`) : `FOREIGN` ne la lit pas du tout, avec ou
  sans étage devant. Ce défaut est antérieur et distinct.
