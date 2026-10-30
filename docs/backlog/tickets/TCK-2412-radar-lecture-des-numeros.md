---
id: TCK-2412
title: "Radar : un numéro que le masqueur voit n'est jamais un prix, et `RadarPhone` lit les écritures sénégalaises libres et le demi-cadratin"
status: done
phase: P1
family: technique
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2410]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, donnees-personnelles, adr-0077]
---

## Objectif utilisateur

Le porteur voit, sur une annonce collectée par le Radar, le contact sénégalais de l'annonceur quelle que soit
la façon dont il l'a écrit — et jamais un numéro de téléphone, étranger ou non, pris pour le prix du bien.

## Contexte

Trois défauts relevés par TCK-2410, qui a élargi le masqueur (`PhoneMasker::MASK_PATTERN`) sans toucher au
Radar. Re-mesurés le 2026-10-30 sur la base de cette branche (TCK-2391 + TCK-2410), numéros fictifs :

1. **`RadarAmountParser::parse()` lit un numéro étranger collé comme un montant** :
   `Appelez le 0033612345678 pour la villa` rend un « prix » de 33 612 345 678. Son `phoneSpans()` ne lit que
   `PhoneMasker::PATTERN`, le numéro sénégalais. Effet voisin : `+44 7700 900123, loyer 450 000` rend `null`
   (trois nombres sans marque) au lieu de 450 000.
2. **`RadarPhone::fromText()` ne lit pas les écritures sénégalaises libres que `MASK_PATTERN` masque** :
   `77_123_45_67`, `77,123,45,67`, `(77)1234567`, `(77) 123 45 67`, `77  123  45  67` (espaces doubles),
   `+221 771 234 567`, `+221 - 77 - 123 - 45 - 67`, `7 7 1 2 3 4 5 6 7` rendent tous `[]`, alors que le masqueur
   les masque. Le Radar rate le contact que la passerelle IA, elle, voit.
3. **`RadarPhone::canonical()` rejette le demi-cadratin `–` et le signe moins `−`** que `PATTERN` lit depuis
   TCK-2410 : son `SEPARATORS` ne les connaît pas. `fromText('77–123–45–67')` rend `[]`.

## Contrat de données

Aucun endpoint, aucune migration. Classes touchées : `App\Support\RadarPhone`, `App\Services\Radar\RadarAmountParser`.
`PhoneMasker` ne change pas de comportement (commentaires seulement).

## Contraintes strictes (métier)

- **Un numéro étranger ne devient jamais le contact d'un annonceur** (ADR-0077 §1) : `fromText()` et `canonical()`
  ne rendent que du `+221…`. `PhoneMasker::PATTERN` reste le numéro sénégalais seul
  (`test_the_senegalese_pattern_does_not_read_a_foreign_number` reste vert).
- Les non-cas du fixture partagé `tests/fixtures/ai/donnees-personnelles.json` (prix, dates, listes, versions,
  références, `+221 74 …` fictif) ne deviennent pas des contacts.
- Un numéro sénégalais que `fromText()` lisait avant ce ticket est toujours lu, sauf quand un `+` / `00` devant
  lui forme, pour le masqueur, un numéro étranger (voir « Décisions »).
- Aucun numéro réel dans un document (règle de TCK-2410) : préfixe fictif `+221 74 …` ou numéros manifestement fictifs.

## Delta à produire

- [x] `RadarAmountParser::phoneSpans()` lit `PhoneMasker::MASK_PATTERN` : un nombre qui fait partie d'un numéro,
      sénégalais, étranger ou lien WhatsApp, n'est pas un montant.
- [x] `RadarPhone::fromText()` lit `MASK_PATTERN`, puis ne garde que ce que `canonical()` rend sénégalais.
- [x] `RadarPhone::canonical()` retire tous les séparateurs que le masqueur admet (tirets Unicode, `_`, `,`,
      espaces Unicode) et le `(0)` de trunk derrière `221`.
- [x] Tests : `RadarPhoneTest`, `RadarAmountParserTest`, sur les formes et les non-cas du fixture partagé.

## Critères d'acceptation

- [x] AC1 — `RadarAmountParser::parse()` ne rend aucun montant tiré d'une forme de téléphone du fixture
      (`Appelez le {forme} pour la villa` → `null`), et garde le prix voisin (`{forme}, loyer 450 000 F/mois`).
- [x] AC2 — Chaque forme sénégalaise du fixture (`telephones`) donne exactement son E.164 par `fromText()` ;
      chaque forme étrangère donne `[]`.
- [x] AC3 — Aucun non-cas du fixture (`pas_personnel`) ne donne de contact.
- [x] AC4 — Tout séparateur avec lequel `MASK_PATTERN` lit `77?123?45?67` est accepté par `canonical()`
      (balayage des code points) ; `77–123–45–67` et `77−123−45−67` donnent `+221771234567`.
- [x] AC5 — Les tests existants de `RadarPhone`, `RadarAmountParser` et `PhoneMasker` restent verts.
- [x] AC6 — Chaque nouveau test rougit sans sa modification (ablation consignée).

## Hors périmètre

- Les limites du masqueur lui-même (TCK-2410, « Notes d'implémentation ») : ce que `MASK_PATTERN` ne voit pas,
  le Radar ne le lit pas non plus.
- La forme nationale à zéro initial (`07 71 23 45 67`) : `MASK_PATTERN` la masque comme numéro étranger,
  le Radar ne la lit pas (le Sénégal n'a pas de zéro de trunk).

## Notes d'implémentation

2026-10-30, sur `fix/radar-lecture-des-numeros` (base : TCK-2391 + TCK-2410).

- **`fromText()` lit `MASK_PATTERN`, `canonical()` trie.** Plutôt que d'élargir `PATTERN` une seconde fois,
  le Radar lit exactement ce que le masqueur voit, puis ne garde que ce qui se replie en `+221` + neuf chiffres
  d'un préfixe du plan (`canonical()`, qui juge toujours avec `PATTERN`). Un numéro étranger, une forme
  nationale à zéro (`07 71 23 45 67`) ou un lien `wa.me/33…` passent par `canonical()` et en sortent `null`.
  Le contrôle `FOREIGN_PREFIX` reste : `+1 77 123 45 67 89` n'est pas un numéro étranger pour le masqueur
  (onze chiffres derrière `+1`), sa fin `77 123 45 67` l'est pour le motif sénégalais.
- **Balayage des séparateurs** (`test_chaque_separateur_que_le_masqueur_lit_est_lu_par_le_radar`) : tout code
  point de U+0020 à U+33FF et de U+FE00 à U+FFFF avec lequel `MASK_PATTERN` lit `77?123?45?67` en entier doit
  donner `+221771234567`. C'est la garde contre une prochaine dérive entre le masqueur et `SEPARATORS`.
- **Mesure différentielle** (ancien code contre nouveau, 213 342 lignes distinctes des fichiers suivis) :
  `fromText()` gagne 55 lignes (toutes des écritures libres du masqueur, plus trois limites connues de TCK-2410,
  voir « Décisions ») et en perd 4, toutes des numéros que l'ancien code lisait à tort comme sénégalais :
  `+33 776 12 34 56`, `+32 470 12 34 56`, `+33 820 12 34`, `+30 123 45 67`. `parse()` change sur 81 lignes, toutes
  porteuses d'un numéro : les chiffres du numéro ne sont plus un montant ; quand le numéro était le seul bruit,
  le montant voisin est retenu (`+44 7700 900123, loyer 450 000` → 450 000).
- **Ablations** (onze, chacune rouge, restaurée par `cmp`) : parseur sur `PATTERN` (19 rouges), `fromText()` sur
  `PATTERN` (27), `SEPARATORS` sans tirets Unicode (3), sans `_` (6), sans `,` (6), sans `−` (2), sans `(0)` de
  trunk (3), `(0)` retiré partout (1), `FOREIGN_PREFIX` sans tirets Unicode (1), sans `)` (1), parenthèses gardées (7).

### Décisions prises en autonomie, à revoir

- **`+33 820 12 34`, `+30 123 45 67` ne sont plus lus comme sénégalais.** Retenu : le masqueur y voit un numéro
  étranger (`+33`, `+30` sont des indicatifs ITU), et la plateforme refuse déjà cette saisie comme un indicatif
  manquant (`TelephoneSaisiTest`). Écarté : les lire comme `+221 33 820 12 34`. Raison : un numéro étranger ne
  devient jamais un contact (ADR-0077 §1) ; un contact manqué se rattrape à la main, un message de consentement
  envoyé au mauvais numéro non. `+77 123 45 67` reste lu (`+77` n'est pas un indicatif pour le masqueur).
- **Les limites connues du masqueur deviennent des contacts du Radar** : `3 2 1 0 9 8 7 6 5`, `7 7 5 0 0 0 0 0 0`,
  un tableau compact à virgule (`[70,100,25,50]`), une liste de minutes espacées (`30 20 5 20 10`). Retenu : le
  Radar lit tout ce que le masqueur voit (demande du ticket, une seule définition). Écarté : un second filtre
  propre au Radar. Raison : ces formes sont rares dans une annonce, le porteur valide chaque annonce avant
  publication, et un second filtre referait diverger les deux lectures, le défaut que ce ticket ferme.
- **Le `(0)` de trunk derrière `221` est accepté par `canonical()`** (`+221 (0)77 …`), aussi pour la saisie
  manuelle de l'annonceur (`SetRadarListingAdvertiserRequest`). Retenu : moins restrictif, et le masqueur le lit.
  Écarté : le refuser. Raison : aucune ambiguïté, le `0` n'est pas un chiffre du plan sénégalais.
- **`canonical()` accepte `_` et `,` comme séparateurs**, aussi pour la saisie manuelle (`77,123,45,67`).
  Retenu : la même liste que le masqueur. Écarté : les réserver à `fromText()`. Raison : un seul jeu de
  séparateurs, et `77,123,45,67,89` (dix chiffres) reste refusé.

