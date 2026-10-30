---
id: TCK-2412
title: "Radar : un numéro que le masqueur voit n'est jamais un prix, et `RadarPhone` lit les écritures sénégalaises libres et le demi-cadratin"
status: doing
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
- Un numéro sénégalais que `fromText()` lisait avant ce ticket est toujours lu.
- Aucun numéro réel dans un document (règle de TCK-2410) : préfixe fictif `+221 74 …` ou numéros manifestement fictifs.

## Delta à produire

- [ ] `RadarAmountParser::phoneSpans()` lit `PhoneMasker::MASK_PATTERN` : un nombre qui fait partie d'un numéro,
      sénégalais, étranger ou lien WhatsApp, n'est pas un montant.
- [ ] `RadarPhone::fromText()` lit `MASK_PATTERN`, puis ne garde que ce que `canonical()` rend sénégalais.
- [ ] `RadarPhone::canonical()` retire tous les séparateurs que le masqueur admet (tirets Unicode, `_`, `,`,
      espaces Unicode) et le `(0)` de trunk derrière `221`.
- [ ] Tests : `RadarPhoneTest`, `RadarAmountParserTest`, sur les formes et les non-cas du fixture partagé.

## Critères d'acceptation

- [ ] AC1 — `RadarAmountParser::parse()` ne rend aucun montant tiré d'une forme de téléphone du fixture
      (`Appelez le {forme} pour la villa` → `null`), et garde le prix voisin (`{forme}, loyer 450 000 F/mois`).
- [ ] AC2 — Chaque forme sénégalaise du fixture (`telephones`) donne exactement son E.164 par `fromText()` ;
      chaque forme étrangère donne `[]`.
- [ ] AC3 — Aucun non-cas du fixture (`pas_personnel`) ne donne de contact.
- [ ] AC4 — Tout séparateur avec lequel `MASK_PATTERN` lit `77?123?45?67` est accepté par `canonical()`
      (balayage des code points) ; `77–123–45–67` et `77−123−45−67` donnent `+221771234567`.
- [ ] AC5 — Les tests existants de `RadarPhone`, `RadarAmountParser` et `PhoneMasker` restent verts.
- [ ] AC6 — Chaque nouveau test rougit sans sa modification (ablation consignée).

## Hors périmètre

- Les limites du masqueur lui-même (TCK-2410, « Notes d'implémentation ») : ce que `MASK_PATTERN` ne voit pas,
  le Radar ne le lit pas non plus.
- La forme nationale à zéro initial (`07 71 23 45 67`) : `MASK_PATTERN` la masque comme numéro étranger,
  le Radar ne la lit pas (le Sénégal n'a pas de zéro de trunk).

## Notes d'implémentation
