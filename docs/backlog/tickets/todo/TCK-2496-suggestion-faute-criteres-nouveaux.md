---
id: TCK-2496
title: Suggestion de recherche : lieu compris malgré une faute, compte des critères à retirer, biens nouveaux depuis une date
status: todo
phase: P1
family: back
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  models: []
tags: [back, search, suggest, audit-ux]
---

## Objectif utilisateur

Le chercheur qui tape « appart 3ch mermos » se voit compris (Mermoz) ; sans résultat, il sait combien de biens il retrouverait en retirant un critère ; en rouvrant une recherche récente, il sait combien de biens sont arrivés depuis.

## Contrat de données

`GET /api/search/suggest` (TCK-2474) et la liste publique `GET /api/public/properties`. Trois ajouts, tous **optionnels** dans la réponse (une API antérieure ne les rend pas, le front s'en passe) :

1. **`interpretation`** : un résidu qui correspond **sans ambiguïté** à un lieu que `places` trouve déjà (tolérance aux fautes de la suggestion de lieux) devient le critère de lieu ; la part correspondante de `parts` garde ses positions `from`/`to` dans la saisie (le front affiche « « mermos » lu Mermoz »).
2. **`relaxations`** : quand `interpretation.count === 0`, au plus trois critères dont le retrait rend des biens, chacun `{ key, count }`, triés par compte décroissant, calculés sous la même base que `count`.
3. **Liste publique** : filtre `filter[published_after]=<ISO 8601>` (biens publiés après cette date) ; le front l'emploie pour compter les biens nouveaux d'une recherche récente (`per_page=1`, il lit `meta.total`).

## Contraintes strictes (métier)

- Aucun lieu deviné quand deux lieux sont aussi proches de la faute : le résidu reste du texte.
- Les comptes de `relaxations` respectent les mêmes filtres de visibilité que la liste (biens publics, non test).
- Le journal des recherches (ADR-0088) ne change pas : la suggestion n'écrit toujours rien.
- Le coût d'une suggestion reste borné : `relaxations` seulement sur compte nul, trois comptes au plus.

## Delta à produire

- [x] `App\Services\Search\SuggestService` (en fait `Suggestions\SearchSuggestions`, cf. notes) : reprise d'un lieu tolérant dans l'interprétation ; calcul de `relaxations`.
- [x] `App\Http\Requests\Public\SearchPublicPropertyRequest` : règle de `published_after` (à plat, cf. notes) (date, pas dans le futur) ; application dans `PropertySearchService`.
- [x] Tests : `SuggestInterpretationToleranteTest` (faute reprise ; ambiguïté laissée en texte), `SuggestRelaxationsTest` (compte nul → critères ordonnés ; compte non nul → absent), `PublicPropertyPublishedAfterTest`.
- [x] Contrat de `GET /api/search/suggest` mis à jour dans `docs/features.md` § 2.4 (règles de gestion) — lieu mal écrit, `relaxations`, `published_after` de la liste, et la phrase « une faute n'est corrigée que sur un mot-clé » ramenée à l'analyse (session, 2026-11-09).

## Critères d'acceptation

- [x] AC1 — `q=appart 3ch mermos` rend `criteria` avec le quartier Mermoz et aucun résidu « mermos ».
- [x] AC2 — Une saisie dont la faute est à égale distance de deux lieux garde le mot en résidu.
- [x] AC3 — Une saisie à compte nul rend `relaxations` non vide quand le retrait d'un critère rend des biens, et chaque `count` est celui de la liste ouverte avec ce critère retiré.
- [x] AC4 — `filter[published_after]` exclut un bien publié la veille de la date donnée et garde un bien publié après.

## Hors périmètre

- Les variantes d'écriture tenues par l'IA (TCK-2476), inchangées.
- L'écran du téléphone (TCK-2497).

## Notes d'implémentation

Re-mesuré le 2026-11-09 (vague 1, agent « recherche ») :

- **La suggestion n'est pas `SuggestService`** : `GET /api/search/suggest` est servi par
  `App\Services\Search\Suggestions\SearchSuggestions` (TCK-2474). `SuggestService` ne rend plus que les types et n'est pas
  la classe du contrat. Le delta est donc écrit dans `SearchSuggestions`.
- **La liste publique filtrée n'est pas `GET /api/public/properties`** (une page SQL sans filtre) mais
  `GET /api/public/properties/search`, et elle ne parle **pas** le dialecte `filter[…]` : tous ses filtres sont à plat
  (`contract_type=rent`, `location=…`, cf. `SearchPublicPropertyRequest` et `SEARCH_FILTER_KEYS` du front). Le filtre
  s'appelle donc `published_after=<ISO 8601>` sur `/properties/search` — un `filter[published_after]` serait le seul
  paramètre de la liste dans un second dialecte.
- La faute sur un lieu n'est PAS reprise par le parseur (`SearchQueryParser` : « la faute de frappe d'un MOT-CLÉ (pas
  d'un lieu : TCK-2476) ») ; elle l'est désormais par la suggestion seule, à partir des lieux que l'index des suggestions
  rend déjà sur le résidu — le parseur reste sans base ni réseau.

Décisions non évidentes :

- **Le lieu mal écrit n'est repris que si la saisie n'a compris aucun lieu** : les `places` ne sont cherchés sur le
  résidu que dans ce cas (sinon, sur le lieu compris — `placeText()`), donc « appart mermos dakar » garde « mermos » en
  texte. Le lieu retenu est le plus proche des `places` déjà rendus (aucun appel moteur de plus pour le trouver), par la
  distance du parseur (`SearchQueryParser::distance()`, rendue publique), dans la tolérance de l'index des suggestions
  (`SuggestionIndex::settings()` : une faute dès 4 caractères, deux dès 8, lue et non recopiée), et **seul** à cette
  distance ; une suite de mots tous courants (`isCommonWord` : « grand standing », « vue ») n'est jamais un lieu ; un début
  de lieu (« alma ») est trop loin du nom entier. La saisie est alors **relue** par le parseur, ce lieu en plus
  (`SearchQueryParser::withPlaces()`, `PlaceLexiconAvecLieuxEnPlus`) : les positions `from`/`to` de la part, les mots de
  liaison et le résidu sont ceux d'un lieu connu. Coût : une requête moteur de plus (les biens seuls), seulement quand
  un lieu est repris. Une saisie qui n'a rien compris d'autre (« mermos » seul) devient une interprétation.
- **`relaxations` vit dans `interpretation`**, présente (éventuellement `[]`) quand `count === 0`, absente sinon. `key`
  est le paramètre de la liste, ou `q` pour le résidu. Retirer une clé de la saisie fait REVENIR la valeur de la base
  pour cette clé (la règle de fusion de la navigation) ; la ville déduite d'un quartier n'est pas une clé (aucune part).
- **« trois comptes au plus » est lu « trois RENDUS au plus, huit SONDES au plus, dans un seul `/multi-search` »** —
  lecture ACCEPTÉE par la session après la revue adverse (2026-11-09). Choisir trois critères à sonder avant d'avoir
  compté serait arbitraire. Le coût reste borné : un seul `/multi-search`, une sonde `hitsPerPage: 0` par clé, au plus
  `RELAXATIONS_PROBES_MAX = 8` (le motif de `PropertySearchService::MAX_PROBES`), et seulement sous un compte nul ; au
  plus `RELAXATIONS_MAX = 3` rendues.
- **`published_after` n'élargit JAMAIS** (revue adverse, défaut majeur corrigé) : sous `published_after`, le repli
  d'ADR-0024 n'est pas joué (`PropertySearchService::search()`). Le compte des nouveaux égale donc ce que la liste
  STRICTE montrera une fois rouverte ; élargi, il comptait sous « villa piscine » un nouveau bien qui ne portait que
  « villa ». `test_le_compte_des_nouveaux_n_elargit_jamais` (total 0, `strategy` ≠ `widened`) — ablation de la garde :
  rouge. **Strictement postérieur** (`>`) : un bien publié À l'instant donné n'est pas compté,
  `test_published_after_est_strict` — ablation `>` → `>=` : rouge.
- **Ville contre quartier homonyme** (« mbourr » : ville Mbour et quartier Mbour de Dakar à égale distance) : la ville
  l'emporte, comme le lexique arbitre sans faute — `test_ville_contre_quartier_homonyme_la_ville_l_emporte` ; ablation
  (`$retenus = $villes` → `return null`) : rouge.
- **`published_after` n'est pas journalisé** (le front le demande pour chaque recherche récente affichée, personne n'a
  cherché) et il est **propre à la liste** : ajouté à `MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE` (sinon
  `MapFiltersParityTest` exige une ligne de carte). ⚠ Le miroir front (`CLES_PROPRES_A_LA_LISTE` de
  `lib/recherche-publique.ts`) et `HORS_INTERFACE` de `search-filters.parity.test.ts` doivent suivre — hors périmètre
  de la vague 1, signalé à la session.
- Le front qui compte les nouveaux doit envoyer `placements=false` : sans lui, chaque compte sert les emplacements
  sponsorisés et compte une impression (ADR-0061 §10) pour une page que personne ne voit.
