---
id: TCK-2428
title: "Socle IA : le masqueur ne lit plus l'étage `R+10` d'une annonce comme un indicatif nord-américain"
status: done
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

Même famille, relevé par la contre-vérification de TCK-2412 (C3) : la plage du masqueur s'arrête avant un
dernier chiffre isolé, que le parseur de prix prend alors pour le seul montant : `+33 7 7 12 34 56 7` rend 7,
`+44 (0)77 123 45 67 89 12` rend 12, `+1 (77) 123 45 67 89` rend 89, `Joignable 77 123 45 67 H24/7` rend 7.
À mesurer avec le reste : le corriger côté masqueur, ou côté `RadarAmountParser` (un chiffre isolé collé à une
plage de numéro n'est pas un montant).

## Contrat de données

Aucun endpoint, aucune migration. `App\Support\PhoneMasker` et son miroir `scripts/check-ai-evals-pii.mjs`, le
fixture partagé `tests/fixtures/ai/donnees-personnelles.json`.

## Contraintes strictes (métier)

- Le masqueur et la garde JS reconnaissent toujours le même ensemble (fixture partagé).
- `Tel+33 6 12 34 56 78` (un `+` collé à un mot) reste masqué : seul l'étage `R+n` est exempté.
- Après le correctif, `RadarPhone::withoutFloorPlus()` peut rester (défense en profondeur) ou être retiré :
  le décider au moment de l'implémentation.

## Delta à produire

- [x] `FOREIGN` n'admet pas un `+` précédé d'un `R`/`r` isolé suivi d'un chiffre (ou la même neutralisation
      que `RadarPhone::withoutFloorPlus()`), côté PHP et côté JS.
- [x] Fixture : `Immeuble R+1 1 250 500 750 F` et `Villa R+2 85 000 000 F` en non-cas ;
      `Immeuble R+10 77 123 45 67` en forme avec contexte (`Immeuble R+10 [TELEPHONE]`).

## Critères d'acceptation

- [x] AC1 — Les formes ci-dessus sont éprouvées des deux côtés (PHP et JS) par le fixture partagé.
- [x] AC2 — Les formes existantes du fixture restent vertes.
- [x] AC3 — Ablation de chaque garde nouvelle : rouge.
- [x] AC4 (ajouté, C3) — `+33 7 7 12 34 56 7`, `+44 (0)77 123 45 67 89 12`, `+1 (77) 123 45 67 89` et
      `Joignable 77 123 45 67 H24/7` ne rendent aucun prix, et le loyer qui les suit reste lu.

## Hors périmètre

- Les autres notations d'étage (`RDC+1`) : à mesurer d'abord.

## Notes d'implémentation

- **Étage** : `PhoneMasker::NOT_A_FLOOR` et son miroir `PAS_UN_ETAGE`, en tête de la branche étrangère :
  `(?!(?<=(?<!\p{L})r)\+[0-9])`, la condition exacte de `RadarPhone::FLOOR_PLUS`. Seule la branche `FOREIGN` la
  porte : `R+221 …` n'est pas une écriture d'étage.
- **Parité PHP/JS mesurée hors fixture**, comme TCK-2410 : 214 332 lignes distinctes des fichiers suivis (celles qui
  portent un chiffre, ≤ 4 000 caractères), 2 090 avec au moins un numéro : 0 écart, avant comme après. Avant/après
  côté PHP : 19 lignes changent, toutes une écriture d'étage (`R+1 …`, `R+10 …`, `R＋10 …`).
- **Limites mesurées, acceptées** : `R+1 202 555 0123` n'est plus masqué (un numéro nord-américain écrit collé à un
  `R` isolé) ; `R+33 6 12 34 56 78` rend `R+[TELEPHONE] 78` (le reste lu comme un numéro sénégalais libre, deux
  chiffres laissés). Le Radar lit déjà ces textes ainsi depuis TCK-2412.
- **Hors périmètre, mesuré** : `Immeuble RDC+1 1 250 500 750 F` et `Immeuble R + 1 1 250 500 750 F` restent masqués
  en `RDC[TELEPHONE] F` et `R [TELEPHONE] F`, et `RadarAmountParser` n'en tire aucun prix. Suite possible, à ticketer.

### Décisions prises en autonomie, à revoir

- **`RadarPhone::withoutFloorPlus()` reste.** Écarté : le retirer. Mesuré par ablation : `FOREIGN_PREFIX` en dépend
  encore (`Villa R+1 77 123 45 67` lirait `+1` devant le numéro, donc étranger : `RadarPhoneTest` rougit).
- **C3 se corrige dans `RadarAmountParser`** : un nombre nu de moins de 100 (`MIN_UNMARKED`), sans monnaie, période ni
  multiplicateur, n'est pas un montant. Écarté, côté masqueur : allonger la plage contredirait la règle « un chiffre
  seul derrière n'est pas au numéro » (`+33 6 12 34 56 78 3 chambres`), et `H24/7` n'a rien d'un numéro. Écarté, la
  règle étroite « un chiffre collé à une plage de numéro » : deux règles au lieu d'une, et `Joignable 7j/7, 450 000`
  restait illisible. Effet de bord voulu : `Prix 85` rend `null` (`unparsed_amount`, l'humain tranche) au lieu de
  85 F. Pour revenir en arrière, il suffit de passer la constante à 1.
