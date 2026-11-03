---
id: TCK-2441
title: "Radar : `R+33 6 12 34 56 78` n'est plus lu comme un numéro sénégalais `+221 33…`"
status: done
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

- [x] Choisir la forme de la première branche de `FLOOR_PLUS`, puis la poser.
- [x] Tests : `Villa R+33 6 12 34 56 78` ne rend aucun contact sénégalais ; les étages existants gardent le leur.

## Critères d'acceptation

- [x] AC1 — `RadarPhone::fromText('Villa R+33 6 12 34 56 78')` et `contactsFromText()` rendent `[]`.
- [x] AC2 — Les cas d'étage existants de `RadarPhoneTest` et de `RadarAmountParserTest` restent verts.
- [x] AC3 — Ablation : rouge.

## Hors périmètre

- Le masqueur (`PhoneMasker`), qui masque déjà `R+33 6 12 34 56 78` en entier.

## Notes d'implémentation

- **Forme retenue, mesurée** : la première branche de `RadarPhone::FLOOR_PLUS` garde sa largeur, mais laisse son `+` à
  un numéro étranger complet : `(?!PhoneMasker::FOREIGN_NUMBER)`. `FOREIGN_NUMBER` est la grammaire de `FOREIGN` (un
  indicatif ITU et le nombre de chiffres de son plan) extraite sans sa borne de fin `(?<!SEP[0-9])` : `FOREIGN` la
  rajoute derrière, `MASK_PATTERN` est identique octet pour octet (md5 comparé à `origin/dev`). Sans la borne, le
  chiffre à chiffre (`R+33 7 7 1 2 3 4 5 6 7`) garde aussi son `+` : il suit alors la règle du `+` nu (B1), jamais un
  contact d'office.
- **Mesure** (grille de 10 905 textes : 5 écritures × étages 0 à 120 × 8 numéros sénégalais et 6 prix, et 49 numéros
  étrangers collés derrière `R` × 5 suites) :
  - `dev` : 275 contacts sénégalais inventés à partir d'un numéro étranger ;
  - forme étroite `R+0`..`R+19` (comme le masqueur) : 0 inventé, mais tout étage de 20 à 120 perd son contact ;
  - forme retenue : 0 inventé ; seuls les étages de 20 ou plus qui sont un indicatif (`20`, `27`, `30`…`98`, et 100 et
    plus) perdent leur contact. `R+25 77 …`, `R+21 77 …` le gardent. Les étages de 0 à 19 : aucun changement.
- **Limite connue, sens sûr** : derrière un étage de 20 ou plus qui est un indicatif, un prix qui a la forme d'un numéro de
  ce plan est perdu (`Immeuble R+30 2 500 000 F` → `null`, 2 500 000 sur `dev`). Le masqueur y lisait déjà un numéro
  (`Immeuble R[TELEPHONE] F` sur `dev`) : le Radar le lit désormais comme lui.

### Décisions prises en autonomie, à revoir

1. **`(?!FOREIGN_NUMBER)` plutôt que `R+0`..`R+19`.** Écarté : la forme étroite du masqueur. Raison : à fabrication nulle
   égale, elle perd le contact de tous les étages de 20 à 120 ; la forme retenue ne perd que ceux qui sont un indicatif.
2. **`R+20 77 123 45 67` perd son contact** (lu comme un numéro égyptien, comme le masqueur le lit). Écarté : le garder,
   ce qui rendrait un faux `+221 33…` pour `R+33 6 12 34 56 78`. Raison : consigne de la session, perdre un contact plutôt
   qu'en inventer un. Un test l'épingle (`RadarPhoneTest`).
3. **Pas d'exemption « prix » derrière un étage de 20 ou plus.** Écarté : laisser le `+` d'étage quand un montant marqué
   suit. Raison : `R+33 6 12 34 56 78 F` (initiale sans point) redeviendrait un fixe sénégalais inventé. Le prix perdu
   passe à l'opérateur (`unparsed_amount`).
