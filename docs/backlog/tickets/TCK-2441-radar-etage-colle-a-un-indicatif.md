---
id: TCK-2441
title: "Radar : `R+33 6 12 34 56 78` n'est plus lu comme un numéro sénégalais `+221 33…`"
status: doing
phase: P3
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2435]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, donnees-personnelles]
---

## Objectif utilisateur

Le porteur ne voit jamais le Radar désigner comme contact d'une annonce un numéro sénégalais fabriqué à partir d'un
numéro étranger collé derrière un `R` (`R+33 6 12 34 56 78`).

## Contexte

Relevé pendant TCK-2435 (numéros fictifs). La première branche de `RadarPhone::FLOOR_PLUS`, `(?<!\p{L})[Rr]\+(?=[0-9])`,
neutralise le `+` de tout `R+` suivi d'un chiffre, quel que soit le nombre qui suit. Le texte devient
`R#33 6 12 34 56 78` : le motif du masquage n'y voit plus d'indicatif, et `SENEGAL_LOOSE` lit `33 6 12 34 56` comme un
fixe sénégalais. Mesuré le 2026-10-30 sur la branche de TCK-2435 :

- `RadarPhone::contactsFromText('Villa R+33 6 12 34 56 78')` rend `["+221336123456"]` ;
- `RadarPhone::fromText()` rend la même chose.

Le masqueur n'est pas touché : depuis TCK-2428, `PhoneMasker::NOT_A_FLOOR` n'exempte qu'un étage de 0 à 19 que rien ne
colle derrière, et `R+33 6 12 34 56 78` y reste masqué en entier. Les écritures ajoutées par TCK-2435 (`RDC+1`, `R + 1`)
suivent déjà la forme étroite côté Radar. Seule la branche historique `R+` collé reste large (hors `+1` / `+7` suivi
d'un numéro complet, borné par TCK-2435).

## Contrat de données

Aucun endpoint, aucune migration. `App\Support\RadarPhone::FLOOR_PLUS` seulement.

## Contraintes strictes (métier)

- Le Radar ne doit pas perdre le contact de `Villa R+1 77 123 45 67`, `Immeuble R+10 77 123 45 67` ni d'aucun cas de
  `RadarPhoneTest::test_un_etage_r_plus_un_devant_le_numero_ne_le_fait_pas_perdre`.
- À mesurer avant de choisir : rétrécir la branche à `R+0`..`R+19`, comme le masqueur, ferait perdre le contact de
  `Immeuble R+20 77 123 45 67`, parce que `+20` est l'indicatif de l'Égypte. Il faut donc comparer un étage au-delà de 19
  suivi d'un numéro avec un numéro étranger collé derrière un `R`.

## Delta à produire

- [ ] Choisir la forme de la première branche de `FLOOR_PLUS`, puis la poser.
- [ ] Tests : `Villa R+33 6 12 34 56 78` ne rend aucun contact sénégalais ; les étages existants gardent le leur.

## Critères d'acceptation

- [ ] AC1 — `RadarPhone::fromText('Villa R+33 6 12 34 56 78')` et `contactsFromText()` rendent `[]`.
- [ ] AC2 — Les cas d'étage existants de `RadarPhoneTest` et de `RadarAmountParserTest` restent verts.
- [ ] AC3 — Ablation : rouge.

## Hors périmètre

- Le masqueur (`PhoneMasker`), qui masque déjà `R+33 6 12 34 56 78` en entier.

## Notes d'implémentation
