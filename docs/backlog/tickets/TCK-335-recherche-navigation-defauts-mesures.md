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

> ⚠️ **Ce plan est la SECONDE rédaction.** La première a été soumise à une revue adverse — sept
> agents, un par lot, chargés de *reproduire le défaut avant d'attaquer la prescription*, puis une
> synthèse. Elle a tenu sur le diagnostic (4/4 des filtres, 5/5 des mesures de recherche) et **cédé
> sur trois prescriptions et deux critères d'acceptation**. Ce qui suit est le plan révisé ; les
> raisons de chaque changement sont dans les notes d'implémentation.

### Étape 0 — ✅ LIVRÉE — filtres publics et locale des libellés

- [x] `furnished` accepte `"true"`/`"false"` — normalisation dans `prepareForValidation()`
      (`parent::` d'abord), `FILTER_NULL_ON_FAILURE` pour que `?furnished=nimportequoi` rende
      toujours 422 plutôt qu'un `false` silencieux
- [x] `area_min`, `area_max`, `featured` ajoutés à `rules()` **et** consommés par `buildFilter()`
- [x] `area` **exclut** les surfaces inconnues (motif `floor_number`/`price`, jamais le OR
      `IS NULL` d'`available_from`), garde `isset() && is_numeric()` et non `! empty()`
- [x] `featured` **unilatéral**, aligné sur `PublicPropertyController::index()`
- [x] `available_from` **écrêté au jour même** — et non simplement libéré de `after_or_equal:today`
- [x] `PropertyResource::translate()` supprimé au profit de `BaseResource::enumLabel()`, dont le
      défaut `'fr'` figé était le même bug endormi
- [x] `apiFetch` transmet `Accept-Language` ; les 4 appelants serveur passent la locale
      explicitement (`clientLocaleCookie()` rend `undefined` en RSC, **en silence**)

### Étape 1 — ✅ LIVRÉE — une panne cesse de se présenter comme un résultat

- [x] `apiFetch` lève `ApiError` (statut + corps) au lieu d'un `Error` nu
- [x] `useSearch` porte l'erreur au lieu d'un booléen ; **jette `prev` sur 422 seulement**
- [x] `ErrorState` (l'unique bloc d'erreur inline du produit) remplace le `<div>` gris maison
- [x] état vide et état d'erreur **s'excluent** ; `total: number | null`, rien d'affiché sur erreur
- [x] `min={0}` sur les bornes numériques — ferme la régression que l'étape 0 avait ouverte
- [x] `furnished=1`/`0` lus correctement ; `featured=false` n'est plus un filtre actif
- [x] `removeFilter('q')` retire aussi `search`

### Étape 2 — ✅ LIVRÉE — la divergence front↔back devient détectable

- [x] `src/types/__tests__/search-filters.parity.test.ts` — lit les **fichiers PHP**, compare
      `SearchFilters` à `rules()` et vérifie que `PropertySearchService` consomme chaque clé
- [x] `web-ci.yml` déclenche sur les deux fichiers PHP lus par la garde
- [x] `searchFiltersSchema` supprimé — 18 clés contre 20, aucun consommateur de production

### Étape 3 — anti-rebond de saisie

**L'emplacement est imposé, et les deux autres sont interdits par mesure.**

- [ ] `src/hooks/useDebouncedValue.ts` + `useDebouncedCallback(fn, ms) → { call, flush, cancel }`,
      extraits de la copie locale de `useSuggest.ts` ; `useSuggest` devient le premier appelant
- [ ] `FilterSidebar` : brouillon **local** par champ, resynchronisé par `useStateSyncedWith`
      (hook existant, TCK-316). **Jamais** dans `useSearch` (5 aller-retours RSC subsistent),
      **jamais** sur `router.replace` (l'input est contrôlé par l'URL : `restoreStateOfTarget` du
      `react-dom` du dépôt réécrit le DOM à l'ancienne valeur, **le caractère frappé disparaît**)
- [ ] champs libres : 400 ms, délai injectable en prop `debounceMs` ; **bornes numériques : commit
      au `blur` et à `Enter`**, sans timer court — chaque frappe intermédiaire rend le catalogue
      entier (176 Ko pour « 150000 »)
- [ ] `set()` fusionne le brouillon en attente dans chaque patch, `flush()` au `blur` et à `Enter`
- [ ] `FilterSidebar.test.tsx` — **sur le composant, pas sur la page** : au niveau de la page,
      `useSearchParams` est figé par le mock, et le test serait vert sans le correctif

### Étape 4 — restauration du défilement

- [ ] `useScrollRestoration` — mémoriser `window.scrollY` par entrée d'historique, restaurer
      **après commit des résultats**. La restauration native opère sur un document au tiers de sa
      hauteur (10 squelettes contre 30 résultats) : les 1 200 px sont écrêtés à 0

### Étape 5 — taxonomie `push` / `replace` *(dépend de l'étape 3)*

- [ ] `search(filters, { historique })` : **`push`** pour les gestes discrets (puces, tri,
      `per_page`, pagination, retrait de filtre), **`replace`** pour les commits de champ continu.
      `push` livré sans l'étape 3 est **pire** que le `replace` actuel : « Dakar » empilerait cinq
      entrées d'historique

### Étape 6 — la fiche en rendu serveur

- [ ] extraire `PropertyDetailContent` ; `page.tsx` devient serveur et lui passe le bien en prop
      (il l'accepte **déjà** en prop — le nombre de composants à convertir est **zéro**)
- [ ] `getProperty = cache(...)` partagé entre `generateMetadata` et la page ; `layout.tsx`
      passe-plat supprimé ; `useProperty` supprimé
- [ ] `loading.tsx` sur `/properties` et `fallback` sur son `<Suspense>` (aujourd'hui vide)
- [ ] JSON-LD `RealEstateListing` — **jamais `Product`/`Offer`** (balisage trompeur au sens des
      règles Google) ; `price` décimal **jamais ×100** ; `geo` **omis** quand les coordonnées sont
      nulles
- [ ] **404 amont → `notFound()`**, toute autre panne → indisponibilité explicite +
      `robots: { index: false }`. Le `try/catch → null` actuel sert un **soft-404 en HTTP 200**
      aux moteurs, mesuré en production aujourd'hui

### Étape 7 — le jeu de démonstration cesse de se contredire *(préalable de l'étape 8)*

- [ ] `SenegalFakerProvider` : le gabarit de titre « meublé » ne sort plus sur `furnished=false`
      (mesuré : 12 biens publics sur 21)
- [ ] `FilterCoverageSeeder` attache 1 à 4 tags par bien et une passe sur un tiers du catalogue —
      **uniquement les tags `feature`/`amenity`**, jamais les 5 tags `crm` (ce sont des tags de
      clients : un bien remonterait sur `q=étudiant`)

### Étape 8 — vocabulaire injecté à l'indexation *(dépend de l'étape 7)*

**Les synonymes Meilisearch sont la mauvaise mécanique**, et c'est mesuré : « vendre » et « vente »
apparaissent dans le texte de **0** bien, donc `vente => vendre` fait passer `q=vente` de 0 à 0. Un
synonyme réécrit un terme de requête ; il ne crée pas un mot absent de l'index.

- [ ] `Property::CONTRACT_SEARCH_ALIASES` + champs `contract_label` et `furnished_label` dans
      `toSearchableArray()`, sur le modèle strict de `type_label`
- [ ] `config/scout.php` : les deux nouveaux champs **EN DERNIER** dans `searchableAttributes` —
      position mesurée : en tête, n'importe quel bien en location passe devant le bien dont le
      titre dit « location »
- [ ] mots vides français ; `tags` ajouté à `searchableAttributes`
- [ ] `PropertySearchVocabularyTest`, **avec ablation sur chaque assertion** : `q=louer` rend déjà
      7 aujourd'hui par accident de gabarit de titre

### Étape 9 — champs de modération conditionnés

- [ ] `approved_at`, `submitted_at`, `rejected_at`, `rejection_reason` derrière
      `$request->user()` (motif déjà présent dans le même fichier pour l'e-mail d'un
      collaborateur). **Rendre les quatre optionnels dans `src/types/property.ts`** — sans quoi
      `tsc --noEmit` rougit, et aucun script npm ne le lance

### Étape 10 — suggestion tolérante à la faute *(villes et quartiers seulement)*

- [ ] `SuggestService` : villes et quartiers par `POST /indexes/{uid}/facet-search`, **avec le
      filtre public exact** — sans lui les comptes sont faux (Mermoz 29 au lieu de 20)
- [ ] **`property_types` RESTE sur le chemin `trans()`** : `type` est indexé par sa valeur d'enum
      anglaise, `facetQuery=maison` rend `[]`. Basculer détruirait la localisation de la
      suggestion, dans le lot dont l'autre moitié répare la localisation
- [ ] `SearchSuggestTest` doit porter `InteractsWithMeilisearch`, sinon il rendrait **vide**

## Notes d'implémentation

_(à remplir par implementing-specs)_
