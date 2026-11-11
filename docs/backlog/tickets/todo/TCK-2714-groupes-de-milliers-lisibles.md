---
id: TCK-2714
title: "Les montants se lisent au téléphone : des groupes de milliers séparés par une espace qu'on voit"
status: todo
phase: P1
family: front
estimate: M
wave: 91
created: 2026-11-11
updated: 2026-11-11
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
  models: []
tags: [front, formatting, intl, montants, typographie, audit-ux, app, decision-porteur]
---

## Objectif utilisateur

Un agent, un bailleur ou un locataire qui lit un montant sur son téléphone — « 1 482 166 F/mois » sous
un bien, dans le champ « Loyer proposé », dans une liste d'encaissements — en distingue les groupes de
milliers d'un coup d'œil, et ne lit ni « 1482166 », ni un zéro de trop.

## Contexte

Relevé pendant la fidélité de TCK-2580 (rideau téléphone de `SaisirUneDemande`, capture de terrain-5
du 2026-11-11, `takussan-web/.fidelite/TCK-2580/cmp-telephone/`) : le loyer s'affiche « 1482166 »,
dans la ligne du bien comme dans le champ. **Le montant est pourtant formaté** — le défaut n'est ni dans
les données ni dans le code de TCK-2580 :

- `PropertyResource` sert `price` en nombre (`(float)`, l. 100 et 526) ; et même une chaîne décimale
  (« 1482166.00 ») se formaterait à l'identique (`Intl.NumberFormat('fr-SN').format('1482166.00')` →
  `1 U+202F 482 U+202F 166`, mesuré sous Node) ;
- le champ est un champ TEXTE groupé (TCK-564), pas un `type=number` ;
- le DOM capturé porte bien les groupes : « À louer · 1 482 166 F/mois », DM Sans 13 px,
  `tabular-nums`.

**La cause est typographique, et elle vaut pour toute l'application.** `Intl` en `fr-SN` sépare les
groupes par l'espace fine insécable **U+202F**, et DM Sans la dessine **0,133 em** de large — contre
**0,266 em** pour l'espace insécable U+00A0 ou l'espace ordinaire. Mesuré le 2026-11-11 dans Chrome
headless avec le fichier du dépôt (`src/app/fonts/dm-sans-latin-wght-normal.woff2`, même
`unicode-range` que le layout racine), à 100 px :

| Texte | Largeur |
|---|---|
| « 1482166 » | 365,4 px |
| « 1 482 166 » en U+202F | 392,0 px (13,3 px par groupe : 0,133 em) |
| « 1 482 166 » en U+00A0 ou U+0020 | 418,6 px (26,6 px par groupe : 0,266 em) |
| Arial, U+202F | 0,139 em : une autre fonte n'y change rien |

À 13 px, chaque groupe ne s'écarte que de **≈ 1,7 px** (≈ 2 px à 15-16 px), sous des chiffres
tabulaires dont le « 1 » porte déjà de larges approches : les chiffres paraissent collés. Les maquettes
(`app-visites-blocs.tsx`, `app-fil-commercial-donnees.ts`) écrivent « 250 000 F/mois » en espaces
ordinaires (0x20), deux fois plus larges que le produit. Les PDF et les CSV, produits par l'API, groupent
déjà par une espace ordinaire (`number_format(…, ' ')` des vues `resources/views/pdf/…`).

**Aucun affichage du dépôt ne groupe autrement** : `montantCourt`, `formatMontant`, `formatNumber` et
la saisie de `FormAmountInput` passent tous par `Intl` `fr-SN` (U+202F). La seule réécriture trouvée,
`CompareColonnes.tsx:108`, ne vise que l'espace AVANT le symbole, pas les groupes.

**Décision du porteur attendue (décision n° 11)** — le ticket ne démarre pas avant elle. Deux options :

- **(a) — recommandée.** Les groupes de milliers s'affichent par une espace **insécable** de pleine
  largeur (U+00A0) : la largeur de la maquette, des PDF et des CSV, toujours insécable (un montant ne se
  coupe jamais en fin de ligne). La règle typographique française de l'espace fine cède à la lisibilité
  d'un chiffre au téléphone, qui est l'usage dominant de `/app`.
- **(b)** Statu quo : U+202F, la convention de CLDR et de l'Imprimerie nationale. Le défaut relevé reste,
  sur tout le produit.

## Contrat de données

Aucun endpoint neuf, aucune donnée neuve, aucun libellé neuf. Les montants restent des NOMBRES jusqu'à
l'écran (ADR-0009) : le séparateur n'existe qu'à l'affichage, et ne doit jamais atteindre la valeur
remise au formulaire ni l'API.

## Direction UX / Artistique

Un montant se lit comme sur la maquette : « 1 482 166 F/mois », des groupes nets, le symbole collé.
Rien d'autre ne change à l'œil — ni la fonte, ni les chiffres tabulaires, ni la taille.

## Contraintes strictes (métier)

- **Une seule convention dans tout l'écran** (le défaut de TCK-374) : la ligne du bien, le champ de
  saisie, les listes, les totaux, le compact (`montantAbrege`) groupent de la même façon.
- **Insécable, toujours** : jamais l'espace ordinaire U+0020 à l'affichage, qui laisserait un montant se
  couper entre deux lignes.
- **La saisie accepte les trois espaces** — U+202F, U+00A0, U+0020 — comme séparateur de milliers, quelle
  que soit celle que l'affichage retient : un montant collé depuis un SMS, un tableur ou une page de
  l'ancienne convention se lit comme il se lit aujourd'hui. Le danger n'est pas l'affichage : c'est une
  règle de `marqueDecimale` qui compare un signe au SEUL `separateurDeMilliers(locale)`, et qui, devant
  une espace qu'elle ne reconnaît plus, pourrait la prendre pour une marque décimale en devise à
  décimales (EUR, USD).
- **Seuls les groupes de milliers changent.** L'espace avant le symbole (U+00A0, déjà) et celle d'un
  pourcentage (« 87 % ») gardent leur forme : ce ticket ne touche pas `formatPercent`.
- L'anglais (`en-GB`, « 1,482,166 ») ne change pas.

## Delta à produire

Option (a), si le porteur la retient :

- [ ] Formatage d'affichage : les groupes de milliers de `formatMontant` (`lib/format/currency.ts`), de
      `formatNumber` (`lib/format.ts`) et donc de `formatCurrency`, `montantCourt` et `montantAbrege`
      (`lib/format/useFormatteurs.ts`) sortent en U+00A0 en `fr` et `wo` (`fr-SN`). Un seul point de
      passage, pas une réécriture par appelant.
- [ ] Saisie de `FormAmountInput` (`lib/format/saisie-montant.ts`) : `ecrireMontant` et `lireSaisie`
      réécrivent dans la nouvelle convention ; `separateurDeMilliers` — et les règles de
      `marqueDecimale` qui le comparent — reconnaissent U+202F, U+00A0 et U+0020 comme séparateurs de
      milliers. `positionApresReecriture` garde le curseur au bon chiffre.
- [ ] `CompareColonnes.tsx:108` : relire la réécriture (elle vise l'espace avant le symbole) contre la
      nouvelle forme.
- [ ] Les tests qui épinglent U+202F (21 fichiers au 2026-11-11 :
      `grep -rlE '202f|202F' takussan-web/src --include='*.test.ts*'`), dont
      `lib/format/__tests__/prereglages-tck-2685.test.ts`, `lib/__tests__/saisie-montant.test.ts`,
      `lib/__tests__/format-currency.test.ts`, `components/forms/__tests__/FormAmountInput.test.tsx`,
      `components/shared/__tests__/Money.test.tsx` : l'attente change de caractère, la propriété
      reste la même.
- [ ] `docs/design-guidelines.md` (§ « Les formats », l. 103-104 : « groupes U+202F ») suit la décision.
- [ ] Exports : rien côté front — les PDF et les CSV sont rendus par l'API, et groupent déjà par une
      espace ordinaire (à vérifier une fois, sans changement attendu).

## Critères d'acceptation

- [ ] AC1 — `montantCourt(1482166)` rend exactement `1 482 166 F` en `fr` et en `wo`, et
      `1,482,166 F` en `en` ; aucun U+202F dans la sortie française. Une sortie inchangée (U+202F)
      échoue.
- [ ] AC2 — Rendu mesuré : dans la ligne du bien de `SaisirUneDemande` au téléphone (390 px, DM Sans
      13 px), l'écart d'un groupe de milliers vaut la largeur d'U+00A0 (≈ 0,266 em, ≈ 3,5 px), mesurée
      au navigateur sur le DOM rendu — pas déduite du code.
- [ ] AC3 — Saisie : « 1 482 166 » tapé ou collé dans `FormAmountInput` avec CHACUNE des trois espaces
      (U+202F, U+00A0, U+0020) remet `1482166` au formulaire et s'affiche en U+00A0 — en XOF **et** en
      EUR. Un test par espace : une saisie qui n'en lit que deux échoue.
- [ ] AC4 — Devise à décimales : « 1 500 » (U+202F) collé en EUR vaut 1500 €, jamais 1,50 € ;
      « 1 500,5 » (U+00A0) vaut 1500,50 €. Un `marqueDecimale` qui prendrait l'espace d'une autre
      convention pour une marque décimale échoue.
- [ ] AC5 — La valeur remise au formulaire et envoyée à l'API reste un nombre sans séparateur : aucun
      U+00A0, U+202F ni U+0020 n'atteint `z.coerce.number` ni le corps d'une requête.
- [ ] AC6 — Insécable : à 360 px, aucun montant d'une liste de `/app` ne se coupe entre deux groupes.
      Une sortie en U+0020 échoue.
- [ ] AC7 — Rien d'autre ne bouge : « 87 % » (`pourcentage`, `formatPercent`) et l'espace avant le
      symbole gardent leur caractère actuel, épinglés par leurs tests existants.

## Hors périmètre

- Le formatage qui suit la locale (dates, séparateurs en anglais, `toLocaleString('fr-SN')` en dur) :
  TCK-347.
- Les PDF, CSV et e-mails rendus par l'API (déjà en espace ordinaire).
- Toute autre convention typographique (espaces avant « : », « ; », « ? »).
- L'option (b) ne demande aucun changement : si le porteur la retient, ce ticket passe en `obsolete`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
