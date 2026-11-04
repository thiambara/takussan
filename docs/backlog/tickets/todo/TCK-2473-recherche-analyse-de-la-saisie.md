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

### Re-mesuré le 2026-11-04, avant le code

- **`bedrooms` est un MINIMUM** : `PropertySearchService::buildFilter()` écrit `bedrooms >= n` (TCK-633), la carte
  aussi (`FiltresDeLaCarte::MINIMUMS`), et la puce du front dit « n+ » (`search.ts`, `bedroomsMin`). Le parseur
  n'émet donc que des minimums : « 3 chambres » → `bedrooms=3`, « F3 » → `bedrooms=2`. Un maximum de chambres
  (« 3 chambres max ») n'a pas de paramètre : « max » sans montant derrière reste dans `residue`.
- **Lieux** : `QuartierDuFiltre` lit le **référentiel** (`geo_neighborhoods`, nom + `former_names`, fusion suivie
  par `merged_into_id`), `VilleDuFiltre` lit `geo_cities` (nom + `former_names`). Mesuré en local : 504 villes,
  362 quartiers, tous `approved`. `DatabasePlaceLexicon` lit donc le référentiel (quartiers `approved` seulement :
  une proposition `pending` n'est visible que de son auteur), repliés par `CleDeQuartier::de()` — la clé même du
  filtre `location`.
  - Collisions mesurées : 8 noms sont à la fois ville et quartier (`pikine`, `colobane`, `darou salam`…) → **la
    ville l'emporte** ; 4 quartiers ont un homonyme dans une autre ville (`medina` : Dakar et Saint-Louis,
    `santhiaba`, `diamaguene`, `colobane`) → `city = null`, rien d'inventé.
  - Un quartier porte un mot du marché : **« Grand Standing »** (référentiel). « appartement grand standing » se
    lisait `location=Grand Standing`. Le parseur ne consulte pas le lexique sur « grand/haut/bon standing ».
- **F(n)** : `PropertyLabels` — F(n) = chambres + 1, studio = F1, « chambre salon » = F2 = 1 chambre, T(n) = F(n).
- **Équipements** : `TagCatalog::EQUIPEMENTS` (versionné, chargé par `tags:sync-catalog`) ; le filtre `tags`
  compare le NOM (`tags = 'Piscine'`), liste à virgules dans l'URL. Le parseur émet les noms du catalogue.
  `Parking` et `Garage` sont aussi des `PropertyType` : voir plus bas.
- **Clés d'URL** : `SEARCH_FILTER_KEYS` (`takussan-web/src/types/search.ts`) — `type` et `tags` sont des listes à
  virgules, `furnished` accepte `true/false/1/0`.
- **Types** : `lang/{fr,en}/properties.php` + `Property::TYPE_SEARCH_ALIASES` (les alias français déjà mesurés,
  TCK-506). Le wolof n'a AUCUN alias validé (`TYPE_SEARCH_ALIASES_WO` volontairement vide, TCK-339, faux amis
  `Dëkk`/`Jën`) : la locale `wo` lit le vocabulaire français, aucun mot wolof n'est ajouté.
  - `immeuble` → `other` : convention du Radar (`ReadsListHtml::TYPE_WORDS`).
  - `duplex` : **aucune** convention dans le dépôt, aucun `PropertyType` → reste dans `residue` (la recherche
    texte le trouve dans les titres). Écart au ticket, assumé : un type inventé filtrerait à tort.
  - `autre` (alias de `other`) n'est pas repris : mot courant (« une autre villa »).

### Décisions prises en codant

- **`RadarAmountParser` est appelé tel quel**, sur le seul segment du montant (« 500k », « 450.000f », « 2 millions ») :
  ni extrait, ni modifié (`git diff` vide, ses 259 tests verts). Le parseur repère le segment (groupes de trois
  chiffres, multiplicateur, monnaie), `RadarAmountParser` en donne la valeur.
- **Montant nu → `price_max`, mais pas un nombre nu de moins de 10 000** sans groupement, multiplicateur, monnaie ni
  opérateur : « villa neuve 2024 » n'est pas un prix. Sous un opérateur (« max 5000 »), la règle de
  `RadarAmountParser` (≥ 100) suffit.
- **Les numéros de téléphone ne sont jamais des quantités** : les plages de `PhoneMasker::MASK_PATTERN` (comme
  `RadarAmountParser`). Deux gardes, chacune avec son témoin : le jeton d'un numéro (« studio max 771 23 45 67 »), et
  le groupement qui s'arrête au numéro (« studio 150 000 776 54 32 10 »). L'étage (« R+1 500 000 F ») non plus.
- **Plafond de 1 000 milliards de XOF** : au-delà, les chiffres juxtaposés (« 150 000 771 234 567 », un numéro groupé
  par trois que le masquage ne voit pas) restent ENTIERS au résidu — aucun morceau n'est relu en prix.
- **Fourchette** : la borne basse sans marque prend le multiplicateur de la haute (« entre 300 et 600k »,
  « entre 1 et 2 millions »). Une fourchette de chambres (« entre 2 et 3 chambres ») ne garde que le minimum : il
  n'existe pas de maximum de chambres.
- **`parking` et `garage`** sont à la fois des types et des équipements : type seul (« parking à louer »),
  équipement après « avec » ou à côté d'un autre type (« villa garage » → `tags=Garage`).
- **Locale** : fr et en sont lus ensemble (les saisies mêlent les deux) ; la locale ne sert qu'aux faux amis —
  `location` et `local` (fr), `sale` (en), `vide` (fr). `wo` lit le français.
- **Fautes de frappe** : seulement sur un mot-clé d'un mot (jamais un lieu : TCK-2476), distance de Damerau ≤ 1
  (≤ 2 au-delà de neuf lettres) sur un mot-clé d'au moins six lettres de même initiale, ou un début de mot-clé d'au
  moins six lettres ; retenue seulement si elle ne désigne qu'une chose. « ville » n'est pas « villa », « comme »
  n'est pas « commerce », « raison » n'est pas « maison ».
- **Positions des `parts`** : en caractères (`mb_substr`), `to` exclu. Un mot de liaison absorbé fait partie de la
  part (« à louer », « à Sacré-Cœur »).
- **« Sacré-Cœur 3 chambres »** : si le plus long lieu finit sur un nombre suivi d'une unité, le lieu plus court est
  retenu et le nombre compte les chambres.
- `DatabasePlaceLexicon` est en cache 10 min (`search.place_lexicon.v1`) : un quartier approuvé, renommé ou fusionné
  se reconnaît au plus tard après ce délai. Une source fusionnée désigne sa cible quel que soit son propre statut.

### À reporter dans les specs

- `docs/features.md` (recherche publique) : la saisie libre est analysée en critères (type, contrat, période, prix,
  chambres en minimum, surface, meublé, ville, quartier, équipements) ; ce qui n'est pas compris reste cherché en texte.
  Le branchement dans la recherche et la suggestion est TCK-2474.

### Revue adverse du 2026-11-04 — correctifs (n° 4, 10, 11)

- 2026-11-04 — **n° 4** : une négation (`sans`, `pas (de)`, `without`, `no`) devant un équipement est lue et n'émet
  rien — ni `tags`, ni résidu (« maison sans piscine » → `type=house`). « sans meuble » reste `furnished=false`.
  **n° 10** : un `furnished` n'est pas émis quand les seuls types compris sont `land`/`parking`/`garage` (« terrain
  vide », « terrain meublé »). **n° 11** : « 2 millions 500 » → 2 500 000 (deux ou trois chiffres après
  « million(s) » ; un seul chiffre reste à part, « 2 millions 5 » étant aussi 2,5 M) ; « N chambres » est `bedrooms`
  jusqu'à 50 (la borne de la liste), au-delà la phrase reste au résidu — plus jamais le type chambre. Tests :
  `SearchQueryParserTest::test_revue_adverse_*`.
