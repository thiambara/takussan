---
id: TCK-2473
title: "Recherche : la saisie libre est comprise — « appart 3ch Almadies moins de 500k » devient des critères"
status: todo
phase: P2
family: back
estimate: M
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: []
blocks: [TCK-2474]
spec_refs:
  features:
    - "docs/features.md"
  models: []
tags: [api, search, suggestion, adr-0088]
---

## Objectif utilisateur

Le visiteur tape sa recherche comme il la dirait, et Takussan la comprend : type, location ou vente, chambres, lieu, prix.

## Contrat de données

**Classe** `App\Services\Search\Query\SearchQueryParser` — sans base, sans réseau, déterministe :

```php
public function parse(string $q, string $locale): ParsedQuery;
```

`ParsedQuery` (readonly) : `criteria` (array, clés = paramètres d'URL publics de la recherche : `contract_type`, `type`,
`rent_period`, `price_min`, `price_max`, `bedrooms`, `area_min`, `area_max`, `furnished`, `city`, `location`, `tags`),
`parts` (list de `{key, value, from, to}` — l'emplacement dans la saisie de ce qui a été compris), `residue` (?string —
ce qui reste, à chercher en texte libre), `understood` (bool — au moins un critère).

Les lieux passent par une interface injectée `App\Services\Search\Query\PlaceLexicon` :

```php
/** Le plus long lieu connu au début de $words : ['kind' => 'city'|'neighborhood', 'name' => …, 'city' => ?string, 'length' => mots consommés] ou null. */
public function longestMatch(array $words): ?array;
```

Implémentation par défaut `DatabasePlaceLexicon` (villes et quartiers du catalogue public ou du référentiel
géographique — re-mesurer lequel `QuartierDuFiltre`/`VilleDuFiltre` utilisent —, en cache, replié par
`CaseInsensitive::fold` et sans accents) ; TCK-2474 et TCK-2476 y ajouteront les variantes (alias).

## Contraintes strictes (métier)

- **Les conventions du dépôt, pas de nouvelles** : F(n)/T(n) = chambres + 1 (`PropertyLabels`, « chambre salon » = F2 =
  1 chambre, studio = F1) ; montants à la sénégalaise (« 1M5 », « 450.000f », « 500k », « 2 millions ») — réutiliser
  la logique de `RadarAmountParser` (l'extraire dans un endroit partagé si besoin, sans changer son comportement : ses
  tests restent verts).
- **Vocabulaire** (fr et en ; wo seulement s'il existe déjà dans le dépôt) : types (`PropertyType` et leurs synonymes :
  appart, appt, villa, maison, studio, chambre, terrain, bureau, magasin, boutique, local, entrepôt, duplex, immeuble) ;
  contrat (louer, location, à louer, loyer, rent → `rent` ; vendre, vente, à vendre, acheter, achat, buy → `sale`) ;
  période (par mois, mensuel, /mois, par jour, nuit → `rent_period`) ; meublé / non meublé ; chambres (« 3 ch », « 3
  chambres », « 3 pièces » → selon la convention F) ; prix (« moins de X », « max X », « jusqu'à X », « < X », « budget
  X » → `price_max` ; « plus de X », « à partir de X », « min X » → `price_min` ; « entre X et Y » ; un montant nu →
  `price_max`) ; surface (« 200 m2 » → `area_min`) ; équipements du catalogue de tags existant (piscine, parking…, à
  re-mesurer).
- Le sens de `bedrooms` côté API (minimum ou exact) se re-mesure, et le parseur le respecte.
- Un mot non compris n'est jamais jeté : il va dans `residue`. Une saisie entièrement non comprise rend `understood = false`.
- Accents, casse, ponctuation et fautes de frappe courantes d'un mot-clé (« apartement », « apparte ») sont tolérés.

## Delta à produire

- [ ] `SearchQueryParser`, `ParsedQuery`, `PlaceLexicon`, `DatabasePlaceLexicon`, liaison dans `AppServiceProvider`.
- [ ] Tests unitaires `SearchQueryParserTest` (lexique simulé) : au moins 40 saisies réelles du marché, dont
      « appartement 3 chambres almadies », « f3 ngor », « villa a louer », « studio meublé mermoz », « terrain 300m2 à
      vendre diamniadio », « chambre salon à louer moins de 100 000 », « appart entre 300k et 600k », « 1M5 », et des
      saisies non comprises ; `DatabasePlaceLexiconTest`.

## Critères d'acceptation

- [ ] AC1 — « appart 3ch Almadies moins de 500k » → `type=apartment`, `bedrooms=3`, `location=Almadies`, `city=Dakar`,
      `price_max=500000`, `residue=null`.
- [ ] AC2 — « f3 ngor à louer » → `bedrooms=2`, `location=Ngor`, `contract_type=rent`.
- [ ] AC3 — « maison de ma tante » → `type=house`, `residue="de ma tante"` (rien d'inventé).
- [ ] AC4 — Les tests de `RadarAmountParser` restent verts.

## Hors périmètre

- La route et l'index : TCK-2474. L'IA : aucune (TCK-2476 tient les variantes hors ligne).

## Notes d'implémentation

_(à remplir)_
