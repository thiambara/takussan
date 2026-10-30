---
id: TCK-2445
title: "Socle IA : un numéro `+7` à zone entre parenthèses ne part plus en clair derrière `RDC` ou un `R` espacé"
status: done
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
- Aucune ligne masquée par le masqueur de `dev` ne sort en clair. Face à 908d62321, seules sortent les écritures
  d'étage suivies d'un prix que TCK-2435 a voulu rendre lisibles.

## Delta à produire

- [x] Derrière `1` ou `7`, la zone entre parenthèses `(XXX)` (`ZONE_REST`, `RESTE_ZONE`) est un numéro quelle que soit
      la marque ; le Radar suit par `CC1_NUMBER`.
- [x] Derrière `7`, la zone de quatre ou cinq chiffres (`+7 (3452) 12-34-56`), lue par `FOREIGN` et par `CC7_REST`.
- [x] Fixture : chaque exemple ci-dessus, et ses variantes à points, barres et espaces insécables, en `avec_contexte`.
- [x] Radar : ces numéros ne sont ni des prix ni des contacts sénégalais.
- [x] m11 : mesurer si `R+ 2 450 000 F` (étage espacé) donnait déjà 2 450 000 avant TCK-2435, puis corriger ou décrire.

## Critères d'acceptation

- [x] AC1 — Les cinq exemples du contexte et leurs variantes, les zones `(0XX)` à `(2XX)`, la zone derrière `+1` et
      les zones longues sont masqués des deux côtés (PHP et JS), éprouvés par le fixture partagé.
- [x] AC2 — `RadarAmountParser` ne rend aucun prix et `RadarPhone` aucun contact pour ces textes.
- [x] AC3 — Parité PHP/JS : 0 écart ; face à `dev`, aucune ligne démasquée ; face au masqueur de 908d62321, aucune
      ligne masquée ne sort en clair hors des écritures d'étage (liste dans le rapport).
- [x] AC4 — Ablation de chaque correctif : rouge.

## Hors périmètre

- Une zone de quatre ou cinq chiffres entre parenthèses derrière un autre indicatif que `7` (`+1`, `+33`…) : non lue,
  inchangée.

## Notes d'implémentation

- **Zone entre parenthèses** : `PhoneMasker::ZONE_REST` (miroir `RESTE_ZONE`), soit une zone de trois chiffres quels
  qu'ils soient entre parenthèses puis sept chiffres, est un numéro derrière `1` comme derrière `7`, quelle que soit la
  marque qui suit (`CC1_NUMBER`). Aucun prix ne s'écrit entre parenthèses : la règle ne coûte aucun prix d'étage, à la
  différence de la forme sans parenthèses (`[3-9]` derrière `7`, forme nord-américaine derrière `1`).
- **Zone longue** (décision de la session) : `CC7_LONG_ZONE` (miroir `ZONE_LONGUE_7`), une zone de quatre chiffres puis
  six, ou de cinq puis cinq, derrière `7`. `FOREIGN` ne la lisait nulle part : `Contact +7 (3452) 12-34-56` partait en
  clair, avec ou sans étage, sur 908d62321 comme sur `dev`. Elle est lue par `FOREIGN` et par `CC7_REST`.
  `RadarPhone::FLOOR_PLUS` lit `PhoneMasker::CC1_NUMBER` sur ses deux branches : il suit sans autre changement.
- **`R+7 (495) 123-45-67 F`** (collé) partait en clair depuis TCK-2428 déjà, sur 908d62321 comme sur `dev` : il est
  masqué du même coup, et gardé dans le fixture.
- **m11, mesuré sur 908d62321 (`git archive`)** : `R+ 2 450 000 F`, `RDC + 2 450 000 F`, `R + 2 450 000 F` rendaient déjà
  2 450 000 avant TCK-2435, et `R+ 12 450 000 F` 12 450 000. Défaut antérieur, corrigé ici parce que simple :
  `RadarAmountParser::SPACED_FLOOR` écarte des candidats un étage de 0 à 19 qui suit `r+ `, `rdc+ `, `r + ` ou
  `rdc + ` dans le texte normalisé (minuscules, une espace). L'étage collé (`R+2`) l'était déjà par le `+`.
- **Limite (effet de bord de m11, accepté par la session)** : l'étage espacé ne compte plus comme un second nombre. Un
  texte dont l'autre nombre est seul en fait son prix, ce que la forme collée faisait déjà (`R + 1 … TCK-2435` rend 2435,
  comme `R+1 … 2435`).
- **Épreuve** (476 306 lignes : les lignes suivies du dépôt qui portent un chiffre, plus une grille écrite à la main
  d'étages × `+7`/`+1`/`+33` × zones entre parenthèses de deux à cinq chiffres × séparateurs × marques) : 0 écart PHP/JS.
  Face à `dev`, aucune ligne démasquée. Face à 908d62321, seules sont démasquées des écritures d'étage suivies d'un prix
  (voulues par TCK-2435) ou d'un numéro sénégalais qui reste masqué. Les lignes réelles du dépôt qui gagnent un masque sont
  toutes des exemples fictifs écrits par ce ticket.

### Décisions prises en autonomie, à revoir

- **Zone `(XXX)` quelconque derrière `7`** (décision de la session). Écarté : `([3-9]XX)`, qui laissait en clair
  `RDC +7 (295) 123-45-67 F`, masqué sur 908d62321.
- **La même zone derrière `1`.** Écarté : la laisser à la seule forme nord-américaine. Raison : `RDC +1 (495) 123-45-67 F`
  (central à 1) était masqué sur 908d62321 et partait en clair ; la règle ne coûte aucun prix, comme derrière `7`.
- **Zone de cinq chiffres avec celle de quatre.** Écarté : quatre seulement. Raison : le plan russe écrit aussi des zones
  de cinq chiffres (`(34922) 1-23-45`) ; même garantie, aucune ligne du dépôt touchée.
- **m11 corrigé plutôt que décrit.** Écarté : le laisser en limite. Raison : l'étage espacé se lit désormais comme
  l'étage collé, avec une garde de longueur fixe et cinq ablations rouges.
