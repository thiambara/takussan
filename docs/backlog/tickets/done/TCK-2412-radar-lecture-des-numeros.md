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

Aucun endpoint, aucune migration. Classes touchées : `App\Support\RadarPhone` (nouvelle méthode publique
`contactsFromText()`), `App\Services\Radar\RadarAmountParser`, et l'appelant qui choisit un contact d'office :
`ExtractRadarListing` (le numéro du texte quand le modèle n'en rend aucun). `ExtractionNormalizer` (la preuve
qu'un numéro rendu par le modèle est dans la source) garde `fromText()`. `PhoneMasker` ne change pas de
comportement (commentaires seulement).

## Contraintes strictes (métier)

- **Un numéro étranger ne devient jamais le contact d'un annonceur** (ADR-0077 §1) : `fromText()` et `canonical()`
  ne rendent que du `+221…`. `PhoneMasker::PATTERN` reste le numéro sénégalais seul
  (`test_the_senegalese_pattern_does_not_read_a_foreign_number` reste vert).
- Les non-cas du fixture partagé `tests/fixtures/ai/donnees-personnelles.json` (prix, dates, listes, versions,
  références, `+221 74 …` fictif) ne deviennent pas des contacts.
- Un numéro sénégalais que `fromText()` lisait avant ce ticket est toujours lu, sauf quand un indicatif étranger
  (`+33`, `0033`) est écrit juste devant lui. Un `+` / `00` nu devant lui (`+77 …`, `77 … + 78 …`) l'écarte du
  seul contact d'office (voir « Décisions »).
- Un numéro étranger écrit chiffre à chiffre ne devient pas un contact d'office sénégalais recollé (`+33 7 7 1 2 …`).
- Le refus STOP se juge sur la lecture la plus large (`fromText()`) ; un contact choisi d'office, sur la plus
  prudente (`contactsFromText()`).
- Aucun numéro réel dans un document (règle de TCK-2410) : préfixe fictif `+221 74 …` ou numéros manifestement fictifs.

## Delta à produire

- [x] `RadarAmountParser::phoneSpans()` lit `PhoneMasker::MASK_PATTERN` : un nombre qui fait partie d'un numéro,
      sénégalais, étranger ou lien WhatsApp, n'est pas un montant.
- [x] `RadarPhone::fromText()` lit `MASK_PATTERN`, puis ne garde que ce que `canonical()` rend sénégalais.
- [x] `RadarPhone::canonical()` retire tous les séparateurs que le masqueur admet (tirets Unicode, `_`, `,`,
      espaces Unicode) et le `(0)` de trunk derrière `221`.
- [x] Tests : `RadarPhoneTest`, `RadarAmountParserTest`, sur les formes et les non-cas du fixture partagé.
- [x] Vérification adverse : `+` / `00` nu devant le motif, indicatif espacé, étage `R+1` neutralisé ;
      `contactsFromText()` (`+` / `00` nu, unité derrière, mot de prix ou de liste devant, crochet) au repli
      d'`ExtractRadarListing` ; la plage d'un numéro dans le parseur s'étend à l'indicatif écrit devant.
- [x] Contre-vérification : le `+` / `00` nu ne vaut que pour le contact d'office (C1) ; `ExtractionNormalizer`
      revient à `fromText()`, une unité d'une lettre ne compte que suivie d'une espace ou de la fin du texte (C2).

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
- [x] AC7 (vérification adverse B1) — `+`, `+ `, `00`, `00 ` devant tout indicatif de 1 à 999 puis un numéro
      sénégalais (en groupes, collé, à espaces doubles, chiffre à chiffre) ne donnent aucun contact d'office ; `221`, si.
- [x] AC8 (I1) — `(R+1) 77 …`, `R+1,77 …`, `R+1_77 …`, `R+10 77 …`, `F3+1 77 …` gardent leur contact ;
      `Tel+33 7 7 1 …` n'en donne pas.
- [x] AC9 (M1) — `Immeuble R+1 1 250 500 750 F` rend 1 250 500 750 ; `0033 7 7 1 2 3 4 5 6 7` ne rend aucun prix.
- [x] AC10 (M2) — Les limites mesurées du masqueur (`Horaires 30 20 5 20 10 min`, `… 5 % par an`,
      `Lots 3 0 1 2 …`, `Prix (75) 500 00 00`, `[70,100,25,50]`) ne créent pas d'annonceur d'office ; le refus
      STOP et la preuve de présence les lisent toujours.
- [x] AC11 (contre-vérification C1) — `77 … + 78 …`, `77 … +78 …`, `WhatsApp + 77 …` : chaque numéro est lu par
      `fromText()`, et un STOP sur le numéro qui suit le `+` arrête l'annonce à l'entrée (`RadarListingIntake`) et
      avant l'appel au modèle (`ExtractRadarListing`).
- [x] AC12 (C2) — `Infos et prix : 77 …` reste une preuve de présence pour le normaliseur ; `… M. Diallo`, `… h24`,
      `… H24/7` derrière un numéro le laissent un contact d'office.

## Hors périmètre

- Les limites du masqueur lui-même (TCK-2410, « Notes d'implémentation ») : ce que `MASK_PATTERN` ne voit pas,
  le Radar ne le lit pas non plus.
- La forme nationale à zéro initial (`07 71 23 45 67`) : `MASK_PATTERN` la masque comme numéro étranger,
  le Radar ne la lit pas (le Sénégal n'a pas de zéro de trunk).
- Défauts anciens du parseur, inchangés (vérification adverse M3) : `Tel 2210771234567` rend un montant ;
  `Étage 3 - 77 123 45 67` rend 3, `Ref 1-77 123 45 67` rend 1, `Loyer 70 1 23 45 67 F` rend 67 ; un ou deux
  chiffres laissés derrière un numéro étranger (`+1 (77) 123 45 67 89`) deviennent le seul candidat.
- Côté masqueur (TCK-2410), suite possible : `R+10 77 123 45 67` et `R+1 1 250 500 750 F` y sont masqués comme
  numéros nord-américains (son `FOREIGN` n'exclut pas une lettre devant le `+`), ce qui ôte le prix ou le
  numéro du texte envoyé au modèle. Id réservé : TCK-2428.

## Notes d'implémentation

2026-10-30, sur `fix/radar-lecture-des-numeros` (base : TCK-2391 + TCK-2410).

- **`fromText()` lit `MASK_PATTERN`, `canonical()` trie.** Plutôt que d'élargir `PATTERN` une seconde fois,
  le Radar lit exactement ce que le masqueur voit, puis ne garde que ce qui se replie en `+221` + neuf chiffres
  d'un préfixe du plan (`canonical()`, qui juge toujours avec `PATTERN`). Un numéro étranger, une forme
  nationale à zéro (`07 71 23 45 67`) ou un lien `wa.me/33…` passent par `canonical()` et en sortent `null`.
  Le contrôle `FOREIGN_PREFIX` reste : `+1 77 123 45 67 89` n'est pas un numéro étranger pour le masqueur
  (onze chiffres derrière `+1`), sa fin `77 123 45 67` l'est pour le motif sénégalais. Il lit aussi un `+` / `00`
  nu (vérification adverse B1 : `+33 7 7 1 2 3 4 5 6 7`, où le masqueur ne voit pas de numéro étranger et relit
  `33 7 7 1 2 3 4 5` une position plus loin) et un indicatif espacé (`+3 3 7 7 1 …`).
- **L'étage `R+1` est neutralisé** (`withoutFloorPlus()`, `+` → `#`, un octet pour un) avant le motif, dans
  `RadarPhone` et dans le parseur : un seul mécanisme pour `(R+1) 77 …`, `R+10 77 …` (que le masqueur avale
  comme `+10` suivi de dix chiffres) et `R+1 1 250 500 750 F`. Seul `R`/`r` : `à+33 …` reste un indicatif.
- **Deux lectures** : `fromText()` (tout ce que le masqueur voit, moins ce qu'un indicatif étranger précède) sert
  le refus STOP (`refuseIfStopped`, `RadarListingIntake`), la preuve de présence (`ExtractionNormalizer`) et la
  saisie manuelle (`setAdvertiser`, où l'opérateur choisit) ; `contactsFromText()` (moins, en plus, un `+` / `00`
  nu devant et les limites du masqueur) sert le seul choix fait sans humain, le repli d'`ExtractRadarListing`.
- **Balayage des séparateurs** (`test_chaque_separateur_que_le_masqueur_lit_est_lu_par_le_radar`) : tout code
  point de U+0020 à U+33FF et de U+FE00 à U+FFFF avec lequel `MASK_PATTERN` lit `77?123?45?67` en entier doit
  donner `+221771234567`. C'est la garde contre une prochaine dérive entre le masqueur et `SEPARATORS`.
- **Mesure différentielle** (ancien code contre nouveau, 213 342 lignes distinctes des fichiers suivis) :
  `fromText()` gagne 55 lignes (toutes des écritures libres du masqueur, plus trois limites connues de TCK-2410,
  voir « Décisions ») et en perd 4, toutes des numéros que l'ancien code lisait à tort comme sénégalais :
  `+33 776 12 34 56`, `+32 470 12 34 56`, `+33 820 12 34`, `+30 123 45 67`. `parse()` change sur 81 lignes, toutes
  porteuses d'un numéro : les chiffres du numéro ne sont plus un montant ; quand le numéro était le seul bruit,
  le montant voisin est retenu (`+44 7700 900123, loyer 450 000` → 450 000).
- **Ablations, premier passage** (onze, chacune rouge, restaurée par `cmp`) : parseur sur `PATTERN` (19 rouges), `fromText()` sur
  `PATTERN` (27), `SEPARATORS` sans tirets Unicode (3), sans `_` (6), sans `,` (6), sans `−` (2), sans `(0)` de
  trunk (3), `(0)` retiré partout (1), `FOREIGN_PREFIX` sans tirets Unicode (1), sans `)` (1), parenthèses gardées (7).
- **Ablations, après la vérification adverse** (seize, chacune rouge, restaurée par `cmp`) : `+` / `00` nu (3 rouges),
  indicatif non espacé (2), pas d'espace après `+` (1), `+` nu devant `221` écarté (1), décimale devant `00` (1),
  étage non neutralisé (2), filtre de contact coupé (1), sans unité (1), sans mot devant (1), sans crochet (1),
  indicatif explicite filtré (1), plage du parseur sans indicatif (1), parseur sur `PATTERN` (19), `fromText()`
  sur `PATTERN` (28), job sur `fromText()` (1), normaliseur sur `fromText()` (1).
- **Ablations, après la contre-vérification** (trois, rouges, restaurées par `cmp`) : `+` nu aussi pour la
  lecture large (2 rouges unitaires, 6 rouges sur les refus STOP du job et de l'entrée), unités d'une lettre sans
  condition (1), normaliseur sur `contactsFromText()` (1).
- **Mesure différentielle rejouée** (même corpus, plus les 196 phrases de la vérification adverse) : sur le corpus,
  `fromText()` gagne 55 lignes, toutes des contacts, et en perd 10, toutes un `+` / `00` devant un numéro national
  (dont les saisies que `TelephoneSaisiTest` et m6 refusent déjà) ou un numéro étranger ; `parse()` change sur 81
  lignes porteuses d'un numéro. Sur les phrases de la vérification : les neuf lignes de B1 et les cinq de I1
  sont justes, chaque limite mesurée du masqueur est lue par `fromText()` et n'est pas un contact.

### Décisions prises en autonomie, à revoir

- **Un `+` / `00` nu écrit juste devant un numéro national, sans `221`, l'écarte du seul contact d'office** :
  `+33 820 12 34`, `+30 123 45 67`, `+77 123 45 67`, `00 77 123 45 67`, `77 … + 78 …` (révisé après la
  vérification adverse B1, puis la contre-vérification C1). Retenu : tout préfixe sénégalais commence par un
  indicatif ITU (3x, 7, 93), donc un `+` nu devant lui peut faire d'un numéro étranger un numéro sénégalais
  recollé (`+33 7 7 1 2 …` → `+221 33 77 12 345`) ; la plateforme refuse déjà ces saisies (`TelephoneSaisiTest`,
  m6). Le refus STOP, la preuve de présence et l'opérateur les lisent toujours (`fromText()`) : le numéro
  recollé n'y coûte qu'un refus par excès, et un `+` qui joint deux numéros ne cache plus le second au STOP.
  Écarté : l'appliquer aussi à `fromText()` (un STOP raté, et le texte part chez le fournisseur), ou garder
  `+77 …` comme contact d'office. Raison : un contact manqué se rattrape à la main, un faux numéro démarché non.
- **Un second filtre propre au Radar, pour le seul contact choisi d'office** (révisé après la vérification
  adverse M2, resserré après la contre-vérification C2 : il ne sert plus à la preuve de présence du normaliseur,
  et une unité d'une lettre ne compte que suivie d'une espace ou de la fin du texte). L'annonceur se crée à l'extraction (`findOrCreate($phones[0])`), avant toute validation humaine :
  la première motivation (« le porteur valide chaque annonce ») ne couvrait pas ce cas. Retenu :
  `contactsFromText()` écarte une forme sans indicatif qu'une unité suit (`min`, `km`, `h`, `%`, `m²`, `F`…),
  qu'un mot de prix ou de liste précède (`Prix`, `Loyer`, `Lots`, `Horaires`, `Distances`, `Charges`…), ou qu'un
  crochet ouvre. Le refus STOP et la preuve de présence gardent la lecture large ; `Infos et prix : 77 …` n'est
  donc pas un contact d'office quand le modèle ne rend aucun numéro, mais le numéro que le modèle rend reste prouvé. Écarté : filtrer `fromText()` lui-même (un STOP raté
  est pire qu'un contact raté), ou ne rien filtrer. Limites restantes : une liste sans unité ni mot autour
  (`3 2 1 0 9 8 7 6 5`, `30 20 5 20 10 120`) reste un contact possible ; un vrai numéro écrit `Prix 77 123 45 67`
  n'en est plus un.
- **Le `(0)` de trunk derrière `221` est accepté par `canonical()`** (`+221 (0)77 …`), aussi pour la saisie
  manuelle de l'annonceur (`SetRadarListingAdvertiserRequest`). Retenu : moins restrictif, et le masqueur le lit.
  Écarté : le refuser. Raison : aucune ambiguïté, le `0` n'est pas un chiffre du plan sénégalais.
- **`canonical()` accepte `_` et `,` comme séparateurs**, aussi pour la saisie manuelle (`77,123,45,67`).
  Retenu : la même liste que le masqueur. Écarté : les réserver à `fromText()`. Raison : un seul jeu de
  séparateurs, et `77,123,45,67,89` (dix chiffres) reste refusé.

