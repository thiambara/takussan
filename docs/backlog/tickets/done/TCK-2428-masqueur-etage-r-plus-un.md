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
  `(?!(?<=(?<!\p{L})r)\+(?:[0-9]|1[0-9])(?![0-9]))`. Un `R` isolé, le `+`, un étage de 0 à 19 que rien ne colle
  derrière. Aucun indicatif à deux ou trois chiffres ne commence par 1, donc `R+44 7700 900123` reste un numéro.
  C'est plus étroit que `RadarPhone::FLOOR_PLUS`, à la demande de la vérification (B1 : `R+33612345678` restait en
  clair ; B2 : `R+44 7700 900123`, `R+49 151 2345 6789`, `R+34 612 34 56 78`, `R+27 82 123 4567` aussi). Côté Radar, rétrécir `FLOOR_PLUS` ne changerait rien d'observable, parce qu'un numéro étranger n'y est pas un
  contact et qu'un nombre collé à un `+` n'est pas un prix : il reste donc tel quel. Seule la branche `FOREIGN` porte
  l'exemption : `R+221 …` n'est pas une écriture d'étage.
- **Parité PHP/JS mesurée hors fixture**, comme TCK-2410 : 214 346 lignes distinctes (les fichiers suivis qui portent
  un chiffre, ≤ 4 000 caractères, plus des cas d'étage écrits à la main), 2 102 avec au moins un numéro : 0 écart
  après la correction de B1.
- **Limites assumées** : `R+1 202 555 0123` et `R+7 912 345 67 89` ne sont plus masqués. Un indicatif d'un chiffre
  suivi d'une espace s'écrit comme un étage, et l'étage `R+1` domine dans les annonces. `R+33 6 12 34 56 78` rend
  `R+[TELEPHONE] 78`. Un étage au-delà de 19 (`Immeuble R+20 77 123 45 67`) n'est pas exempté : il est masqué comme
  avant le ticket.
- **Parité après B2** : 0 écart sur 214 353 lignes (2 109 avec au moins un numéro).
- **Prix (C3)** : un nombre nu de moins de 100 (`MIN_UNMARKED`), sans monnaie, période ni multiplicateur, n'est jamais
  **choisi**, mais il reste un candidat : la garde des fourchettes (`Prix 85 à 90 millions`), le filtre des cautions
  (`Loyer 75, caution 150 000`) et l'ambiguïté (`Prix 85, réf 4521`) le voient, et rendent `null` comme avant. Il ne
  quitte l'ensemble que s'il touche une plage de numéro (au plus trois séparateurs) ou s'il suit un `/` (`H24/7`).
- **Suite** : `RDC+1` et `R + 1` restent masqués → TCK-2435.

### Décisions prises en autonomie, à revoir

- **`RadarPhone::withoutFloorPlus()` reste.** Écarté : le retirer. Mesuré par ablation : `FOREIGN_PREFIX` en dépend
  encore (`Villa R+1 77 123 45 67` lirait `+1` devant le numéro, donc étranger : `RadarPhoneTest` rougit).
- **C3 se corrige dans `RadarAmountParser`, pas dans le masqueur.** Allonger la plage contredirait la règle « un
  chiffre seul derrière n'est pas au numéro » (`+33 6 12 34 56 78 3 chambres`), et `H24/7` n'a rien d'un numéro.
  Effet voulu : `Prix 85` rend `null` (`unparsed_amount`, l'humain tranche) au lieu de 85 F. La première version
  retirait le petit nombre de l'ensemble des candidats, ce qui défaisait la garde des fourchettes et des cautions
  (vérification I1, I2) : corrigé.
