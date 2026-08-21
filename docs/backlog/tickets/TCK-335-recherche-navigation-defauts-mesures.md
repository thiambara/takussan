---
id: TCK-335
title: "Recherche & navigation publiques — défauts mesurés de bout en bout"
status: doing
phase: P0
family: full
estimate: XL
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
tags: [back, front, search, filters, navigation, performance, i18n, seo, bug]
---

## Objectif utilisateur

Un visiteur qui pose un filtre obtient le résultat que ce filtre annonce, et une recherche
écrite en français courant (« villa à louer à Saly ») restreint réellement les résultats au
lieu de les classer.

## Contrat de données

**Source du ticket — à lire avant d'ouvrir un fichier :**
[`docs/qa/audit-recherche-navigation-2026-08-21.md`](../../qa/audit-recherche-navigation-2026-08-21.md).
Chaque défaut ci-dessous y porte sa commande, son code HTTP et son compte mesuré, sur une base
locale reconstruite (836 biens, 258 publics, index Meilisearch resynchronisé). **Ne pas
re-diagnostiquer** : les mesures sont datées et reproductibles ; les reproduire d'abord, corriger
ensuite.

Endpoints et surfaces concernés — tous **existants**, aucun n'est à créer :

- `GET /api/public/properties/search` → `PublicPropertyController::search()`,
  `SearchPublicPropertyRequest`, `App\Services\Search\PropertySearchService`
- `GET /api/search/suggest` → `SuggestController`, `App\Services\Search\SuggestService`
- `GET /api/public/properties/{slug}` → `PublicPropertyController::show()`
- Réglages moteur : `config/scout.php` (bloc `meilisearch.index-settings`),
  `Property::TYPE_SEARCH_ALIASES`, `Property::toSearchableArray()`
- Sérialisation : `App\Http\Resources\PropertyResource`
- Front : `src/hooks/useSearch.ts`, `src/hooks/useProperty.ts`,
  `src/components/search/{FilterSidebar,SearchToolbar,SearchAutocomplete}.tsx`,
  `src/components/property/PropertiesDiscoveryPage.tsx`,
  `src/app/(public)/properties/page.tsx`, `src/app/(public)/properties/[slug]/`,
  `src/data/navigation.ts`, `src/i18n/request.ts`, `src/lib/api.ts` (`apiFetch`)

Les filtres visés sont ceux que la spec liste déjà : `surface` et `transaction` en **P0**
(§1.2), `meublé`, `disponibilité` et `étage` en **P1** (§1.2), les biens **en vedette** de la
page d'accueil (§1.2), l'autocomplétion (§2.4) et les trois langues FR/EN/WO (§2.8).

## Direction UX / Artistique

Rien à redessiner : l'interface existante est correcte, c'est ce qu'elle **affirme** qui est
faux. Deux intentions guident les choix front :

- **Une commande visible fait ce qu'elle dit, ou n'est pas visible.** Une puce de filtre actif,
  un compteur de filtres, un lien de pied de page « coups de cœur » : chacun est une promesse.
- **Ne jamais présenter une panne comme un résultat.** Un 422 doit produire un état d'erreur
  explicite, jamais « 0 bien trouvé ».
- **La recherche doit rester silencieuse tant que l'utilisateur écrit** — pas de clignotement
  entre deux caractères, pas d'état vide transitoire.

## Contraintes strictes (métier)

- L'isolation du catalogue public ne bouge pas : `Property::scopePublic()` et le filtre moteur
  de `PropertySearchService::buildFilter()` doivent continuer à décrire le **même** ensemble.
  Aucun brouillon, bien de test, vendu ou loué ne doit pouvoir remonter.
- `meta.total` reste le compte filtré **exact** rendu par le moteur — jamais une estimation, et
  jamais un compte pré-filtrage.
- Toute clé de filtre acceptée par `SearchPublicPropertyRequest` doit être **effectivement
  consommée** par `PropertySearchService`. Réciproquement : une clé que le service ne sait pas
  traiter ne doit pas figurer dans l'interface. C'est l'invariant que ce ticket installe.
- Le préfixe `/api` reste asymétrique (`apiFetch` l'ajoute, `apiRequest` non) — ne pas
  « harmoniser » en passant.
- Les libellés affichés restent la propriété du front (principe non négociable n°5) ; ce ticket
  corrige la **locale** des libellés déjà émis par l'API, il n'en déplace aucun.
- Aucune régression de couverture : le cliquet CI reste à 86 %
  (`php bin/coverage-gate.php storage/coverage/clover.xml --min=86`).

## Delta à produire

### Lot 1 — les filtres qui n'atteignent pas le moteur (P0, correctif court)

- [ ] `SearchPublicPropertyRequest` : `furnished` accepte la chaîne `"true"` / `"false"` (la
      règle `boolean` de Laravel les refuse ; le front envoie exactement `"true"`)
- [ ] `SearchPublicPropertyRequest` : ajouter `area_min`, `area_max`, `featured`
- [ ] `PropertySearchService::buildFilter()` : consommer `area_min`, `area_max`, `featured`
- [ ] `SearchPublicPropertyRequest` : `available_from` cesse de rendre 422 sur une date passée
      (une recherche sauvegardée ou un lien partagé vieillit)
- [ ] Tests : `PublicPropertySearchFilterTest` — un scénario par filtre, chacun vérifiant que
      `meta.total` **diffère** du total sans filtre (une assertion « 200 » ne prouve rien ici)

### Lot 2 — l'interface cesse d'affirmer ce qu'elle ne fait pas

- [ ] `useSearch` : état d'erreur distinct de l'état vide ; un 422 n'affiche plus
      « 0 bien trouvé »
- [ ] `SearchToolbar` : la puce et le compteur ne comptent que des filtres réellement appliqués
- [ ] Test front : `/properties?featured=true` ne rend pas le même compte que `/properties`

### Lot 3 — une requête par caractère frappé

- [ ] Anti-rebond sur les champs libres de `FilterSidebar` (ville, quartier, tags, mot-clé) et
      sur les bornes numériques (prix, surface)
- [ ] Test : frapper 5 caractères produit **1** appel à `/search`, pas 5

### Lot 4 — retour arrière et historique

- [ ] `useSearch` passe par TanStack Query (déjà présent, déjà employé par `useSuggest`) :
      cache et déduplication, pour que le bouton Précédent n'ait rien à refaire
- [ ] Idem `useProperty`
- [ ] Les changements de filtre empilent l'historique au lieu de l'écraser (`router.replace`
      actuel), et la position de défilement est restaurée au retour depuis une fiche

### Lot 5 — vocabulaire du moteur

- [ ] `config/scout.php` : mots vides et synonymes sur l'index `properties` (transaction :
      louer / location / à louer / vendre / vente / à vendre ; abréviations courantes)
- [ ] `Property::TYPE_SEARCH_ALIASES` : couvrir le wolof, et les termes de transaction
- [ ] Rendre `tags` **searchable** en plus de filtrable, pour que le vocabulaire d'équipement
      soit atteignable par le texte
- [ ] Seeders : rattacher des tags d'équipement à une part des biens — aujourd'hui les 6 tags
      existent et **aucun bien n'en porte**, donc ni le filtre ni la facette ne sont exerçables
- [ ] Tests : `PropertySearchVocabularyTest` — `q=louer` doit s'approcher de
      `contract_type=rent`, `q=meublé` de `furnished=1`

### Lot 6 — rendu serveur et poids de page

- [ ] `/properties` : page serveur lisant `searchParams`, résultats rendus dans le HTML ;
      `loading.tsx` ou `fallback` sur le `<Suspense>` (aujourd'hui vide)
- [ ] `/properties/[slug]` : rendu serveur, et **réutiliser** le bien déjà récupéré par le
      `generateMetadata` du layout au lieu de le redemander côté client
- [ ] JSON-LD `RealEstateListing` sur la fiche
- [ ] `src/i18n/request.ts` : découper le dictionnaire par espace de noms (266 Ko inlinés
      aujourd'hui à chaque page)

### Lot 7 — locale et conventions

- [ ] `PropertyResource::translate()` : `Lang::get($key, [], 'fr')` fige la locale en dur →
      utiliser la locale active résolue par `SetLocaleMiddleware`
- [ ] `apiFetch` transmet `Accept-Language` (comme `apiRequest`)
- [ ] `/search` honore `fields[properties]` (règle non négociable du dépôt), et cesse d'exposer
      `approved_at`, `submitted_at`, `rejection_reason` sur une surface publique
- [ ] `SuggestService` : s'appuyer sur Meilisearch plutôt que sur `str_starts_with` (une faute
      de frappe rend zéro suggestion), et écarter les quartiers à libellé vide
- [ ] `src/data/navigation.ts` : les entrées `href: '#'` (« Vendre », « Services ») ne sont plus
      présentées comme des liens

## Critères d'acceptation

- [ ] AC1 — `?furnished=true` et `?furnished=false` rendent 200 et des comptes **différents**
      du total sans filtre
- [ ] AC2 — `?area_min=200&area_max=400` rend un compte strictement inférieur au total sans
      filtre
- [ ] AC3 — `?featured=true` rend un compte strictement inférieur au total sans filtre, et le
      lien « coups de cœur » du pied de page mène à ce résultat
- [ ] AC4 — une URL portant `available_from` à une date passée rend 200
- [ ] AC5 — un 422 de `/search` affiche un état d'erreur explicite, jamais « 0 bien trouvé »
- [ ] AC6 — aucune puce de filtre actif ni incrément du compteur pour un filtre non appliqué
- [ ] AC7 — frapper 5 caractères dans un champ du panneau produit 1 appel à `/search`
- [ ] AC8 — le retour depuis une fiche réaffiche la liste sans nouvel appel réseau et restaure
      la position de défilement
- [ ] AC9 — après un changement de filtre, un « Précédent » revient à l'état de filtre
      précédent et ne quitte pas la page
- [ ] AC10 — `q=villa Saly` rend strictement moins de résultats que `q=villa` (aujourd'hui :
      63 contre 63, mêmes ids, même ordre)
- [ ] AC11 — `q=louer` rend un ordre de grandeur comparable à `contract_type=rent`
      (aujourd'hui : 7 contre 204)
- [ ] AC12 — le HTML servi de `/properties` et d'une fiche contient un `<h1>` et au moins une
      annonce, sans exécution de JavaScript
- [ ] AC13 — `Accept-Language: en` rend `"For Rent"` sur `contract_type_label` (aujourd'hui :
      « À louer » dans les trois langues)
- [ ] AC14 — `?fields[properties]=id,title` rend deux clés par bien, pas 36
- [ ] AC15 — l'autocomplétion rend « Mermoz » sur la saisie `mrmoz`
- [ ] AC16 — la suite backend et la suite front restent vertes, et le cliquet de couverture
      tient à 86 %

## Hors périmètre

- **L'analyse d'intention proprement dite** (transformer « villa à louer à Saly » en
  `type=villa&contract_type=rent&city=Saly` par un analyseur de requête) : c'est une décision
  structurelle, elle exige un ADR **avant** implémentation. Le lot 5 ne traite que le
  vocabulaire du moteur — synonymes, mots vides, alias indexés — qui relève de la
  configuration. La recherche en langage naturel est d'ailleurs classée P3 dans la spec.
- La recherche sémantique par embeddings (P3, §2.4).
- La recherche vocale (P3, §1.2).
- L'activation de `SCOUT_QUEUE` en production et la stratégie de réindexation au déploiement.
- La compression HTTP côté serveur : l'audit note qu'elle n'a **pas** pu être vérifiée
  (`artisan serve` ne compresse pas, la configuration du serveur n'est pas dans le dépôt).
  À mesurer sur `preview.api.takussan.com` — ticket distinct si l'écart est confirmé.
- Le fait que le front public appelle une API absente en production : c'est **TCK-332**, et il
  reste la condition pour qu'un visiteur réel voie quoi que ce soit.
- Le tri par popularité : `views_count` vaut 0 partout dans le jeu de démonstration, il ne peut
  pas être exercé tant que le seeder ne l'alimente pas.

## Notes d'implémentation

_(à remplir par implementing-specs)_
