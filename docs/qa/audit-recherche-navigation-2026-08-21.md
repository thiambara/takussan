# Audit — recherche et navigation, de bout en bout

**Mesuré le 2026-08-21**, branche `dev` (`ec3dfbbe`), machine 8 cœurs, `load average` 6,01 au
départ. Base locale reconstruite pour l'occasion : `php artisan migrate --force` (3 migrations en
attente) puis `SEED_DOWNLOAD_MEDIA=false php artisan db:seed` → **836 biens, 258 publics**, index
Meilisearch `takussan_local*` resynchronisé (`scout:sync-index-settings`, 795 documents).

Front `next dev` (Turbopack) sur `:3000`, API `php artisan serve` sur `:8002`, Meilisearch natif
brew sur `:7700`. **Les temps ci-dessous sont donc des temps de DÉVELOPPEMENT, sur boucle locale,
sans latence réseau ni compression** — ils constituent un plancher, jamais une estimation de
production. Les *comptes* de requêtes et les *codes HTTP*, eux, ne dépendent pas du mode.

Sondes reproductibles : `scripts` jetables sous le répertoire de session (playwright-core +
chromium mis en cache). Chaque affirmation ci-dessous porte la commande qui l'établit.

---

## Résumé

La chaîne est bien construite là où on l'a construite : Meilisearch fait le travail dans le moteur
(filtres, facettes, géo, tri poussés dans une seule requête), la tolérance à la faute fonctionne,
la pagination est exacte, l'autocomplétion est débattue et débouncée. **Ce qui manque n'est pas de
la puissance, c'est le dernier maillon : rien ne transforme ce que l'utilisateur écrit en ce qu'il
veut, et quatre commandes de l'interface ne parviennent pas jusqu'au moteur.**

Trois constats, du plus coûteux au moins :

1. **La requête libre ne devient jamais un filtre.** `q=villa Saly` rend *exactement* les mêmes
   63 résultats, dans le même ordre, que `q=villa`. Le mot « Saly » n'exclut rien, ne classe rien.
2. **Quatre filtres de l'interface n'atteignent pas le serveur** — trois sont jetés en silence
   (`area_min`, `area_max`, `featured`), un rend **422** et affiche « 0 bien trouvé » (`furnished`).
3. **Aucune des trois pages principales ne rend une seule annonce côté serveur.** Le HTML pèse
   ~300 Ko dont 88 % de scripts, et ne contient ni `<h1>`, ni lien de fiche.

---

## 1. La requête libre ne devient jamais un filtre

### 1.1 Les mots de lieu et d'intention ne portent rien

```bash
curl -s "…/api/public/properties/search?q=<terme>&per_page=8"
```

| requête | total | 8 premiers ids |
|---|---|---|
| `villa` | 63 | 22, 34, 59, 71, 75, 167, 180, 197 |
| `villa Saly` | **63** | **22, 34, 59, 71, 75, 167, 180, 197** — identiques |
| `villa Dakar` | 63 | 22, 30, 34, 59, 71, 82, 180, 201 |
| `villa a louer a Dakar` | 63 | 22, 30, 71, 201, 238, 240, 320, 337 |

Le nombre de résultats est **invariant**. Meilisearch applique sa règle `words` : il retire les
termes qui ne matchent pas plutôt que d'exclure les documents. C'est le comportement attendu du
moteur — mais rien, en amont, ne convertit « Saly » en `city=Saly` ni « à louer » en
`contract_type=rent`. Un utilisateur qui cherche une villa à Saly reçoit des villas de Dakar, sans
le moindre signal.

### 1.2 Le vocabulaire d'intention n'est pas indexé

```bash
curl -s "…/search?q=louer"      → total = 7      | contract_type=rent → 204
curl -s "…/search?q=vente"      → total = 0      | contract_type=sale →  54
curl -s "…/search?q=a vendre"   → total = 247    ← le « a » matche presque tout : bruit pur
curl -s "…/search?q=meublé"     → total = 21     | furnished=true en base → 99 biens
curl -s "…/search?q=kër"        → total = 0      | wolof : rien
```

Le filtre existe côté serveur dans chacun de ces cas. C'est le *chemin* du mot au filtre qui manque.

**Cause, mesurée sur l'index** (`GET /indexes/takussan_localproperties/settings`) :

```json
"stopWords": [], "synonyms": {}, "dictionary": []
```

Zéro synonyme, zéro mot vide. Et le seul champ de vocabulaire injecté dans l'index,
`Property::TYPE_SEARCH_ALIASES` (`takussan-api/app/Models/Property.php:141`), ne couvre que les
**types de bien, en français** (`land → terrain`, `shop → boutique magasin commerce`). Il n'y a
aucun alias pour la transaction (louer / vendre / location / vente), aucun pour les équipements,
aucun en wolof — alors que le produit livre un dictionnaire `wo`.

*Que « apartment » rende les 35 mêmes résultats que « appartement » n'est pas de la conception :
c'est la tolérance à deux fautes qui joue sur un mot de 11 caractères. Le hasard travaille dans le
bon sens ici ; il ne travaillera pas toujours.*

### 1.3 Les équipements ne sont pas atteignables par le texte

`tags` est déclaré **filterable** mais pas **searchable** (`config/scout.php`). Un mot d'équipement
ne peut donc jamais atteindre l'index par cette voie ; il ne trouve que ce qui traîne dans une
description. Le jeu de démonstration ne permet pas d'aller plus loin : les 6 tags d'équipement
existent (`Piscine`, `Climatisation`, `Ascenseur`, `Parking`, `Balcon`, `Terrasse`) et **aucun bien
n'en porte** — le filtre `tags=` et la facette correspondante ne sont donc jamais exercés en
développement. C'est une lacune de seeder autant qu'une lacune de recherche.

### 1.4 La suggestion n'utilise pas le moteur qui est là

`SuggestService` (`app/Services/Search/SuggestService.php`) construit une liste depuis **MySQL**
(500 villes, 500 quartiers, cache 300 s) et filtre par `str_starts_with` sur une chaîne normalisée.

```
q=merm    → Mermoz          ✓ préfixe
q=mrmoz   → (rien)          ✗ une faute suffit
q=akar    → (rien)          ✗ pas de sous-chaîne
q=appart  → Appartement     ✓ (uniquement avec Accept-Language: fr)
```

Meilisearch, qui tourne à côté, aurait rendu « Mermoz » sur `mrmoz`. La suggestion ne propose par
ailleurs **aucune annonce** (titre, référence) et **aucune combinaison** (« Appartement à Mermoz »)
— or c'est exactement là que se joue « deviner ce que l'utilisateur veut ».

Détail annexe : `resolveNeighborhoods()` filtre par `whereNotNull('neighborhood')`, ce qui laisse
passer **40 lignes à chaîne vide** dans le jeu courant. Elles ne remontent pas en suggestion (le
préfixe ne matche pas) mais apparaissent dans les facettes `locations`.

---

## 2. Quatre filtres de l'interface n'atteignent pas le moteur

`PublicPropertyController::search()` transmet `$request->validated()`. Une clé absente de
`SearchPublicPropertyRequest::rules()` est donc **supprimée avant** d'atteindre
`PropertySearchService`. Trois clés que l'interface produit sont dans ce cas.

| filtre visible dans le panneau | envoyé par le front | reçu par le service | résultat mesuré |
|---|---|---|---|
| Surface min (`≥ 200 m²`) | `area_min` | ✗ jeté | **258 biens** = total sans filtre |
| Surface max (`≤ 400 m²`) | `area_max` | ✗ jeté | **258 biens** |
| « ★ En vedette » | `featured` | ✗ jeté | **258 biens** |
| « Meublé » / « Non meublé » | `furnished=true` | **422** | **0 bien + « Une erreur est survenue »** |

Mesuré dans le navigateur, page `/properties` :

```
?featured=true              → chip « ★ En vedette », compteur « Filtres 1 », « 258 biens trouvés »
?area_min=200&area_max=400  → chips « ≥ 200 m² » « ≤ 400 m² », compteur 2, « 258 biens trouvés »
?furnished=true             → 422 → « 0 biens trouvés » + « Aucun bien trouvé »
?furnished=false            → 422 → idem
```

Deux points aggravent le premier cas : **`SearchToolbar` affiche une puce de filtre actif** et
incrémente le compteur pour des filtres qui ne s'appliquent pas — l'interface affirme un état
qu'elle n'a pas ; et le **pied de page du site** pointe `/properties?featured=true` sous le libellé
« coups de cœur » (`src/data/navigation.ts`), c'est-à-dire un lien de navigation permanent qui
promet une sélection et rend le catalogue entier.

### `furnished` — pourquoi 422

La règle est `'furnished' => 'nullable|boolean'`. La règle `boolean` de Laravel accepte
`true, false, 1, 0, "1", "0"` — **pas la chaîne `"true"`**. Or `useSearch.filtersToParams()` écrit
`params.set('furnished', String(v))`, soit exactement `"true"`.

```bash
?furnished=1     → 200
?furnished=true  → 422  {"message":"The furnished field must be true or false."}
```

99 biens publics sont meublés. Le filtre le plus demandé d'un marché locatif est cassé dans les
deux sens, et il échoue en affichant « 0 bien trouvé » — c'est-à-dire en mentant plutôt qu'en
signalant la panne.

### `available_from` — une URL partagée pourrit

La règle est `after_or_equal:today`. Une recherche sauvegardée ou un lien partagé qui porte une
date devenue passée rend **422**, donc « 0 biens trouvés ». `SaveSearchButton` produit précisément
ce genre d'URL.

```
/properties?available_from=2020-01-01 → 422 → « 0 biens trouvés », aucune carte
```

---

## 3. Une requête par caractère frappé

Mesuré au navigateur, page `/properties`, frappe simulée à 150 ms d'intervalle :

```
### champ VILLE — frappe « Dakar » (5 caractères)
  requêtes /api/public/properties/search : 5
     +148 ms  ?city=D&page=1&per_page=30
     +278 ms  ?city=Da&page=1&per_page=30
     +427 ms  ?city=Dak&page=1&per_page=30
     +578 ms  ?city=Daka&page=1&per_page=30
     +743 ms  ?city=Dakar&page=1&per_page=30
  requêtes vers le serveur Next (document/RSC) : 5
  total requêtes réseau : 10

### champ PRIX MIN — frappe « 150000 » (6 caractères)
  requêtes /search : 6  (price_min=1, 15, 150, 1500, 15000, 150000)
  requêtes Next    : 6
  total            : 12
```

Chacune de ces requêtes intermédiaires est une vraie recherche Meilisearch **plus** une hydratation
Eloquent de 30 biens **plus** une sérialisation `PropertyResource` complète — pour un résultat que
personne ne verra. Coût mesuré d'une requête complète en local : **~90 ms** et **29 374 octets**.
Frapper « Dakar » consomme donc ~450 ms de calcul serveur et ~120 Ko de réponse pour afficher un
seul état utile.

**Il n'y a aucun anti-rebond dans cette chaîne.** `useSuggest` en a un (150 ms) ; l'autocomplétion
de la barre est donc correcte. Mais les six champs texte et les quatre champs numériques du panneau
de filtres appellent `onFilterChange` à chaque `onChange`, qui appelle `router.replace`, dont le
changement d'URL relance l'effet de `useSearch`. Ni le hook ni le panneau ne temporisent.

Effet de bord visible : pendant la frappe, `city=D` puis `city=Da` rendent 0 résultat, et l'écran
affiche l'état vide « Aucun bien trouvé » entre deux caractères.

---

## 4. Zéro contenu rendu côté serveur

HTML servi par Next, scripts retirés :

| page | HTML | hors `<script>` | `<h1>` serveur | liens de fiche |
|---|---|---|---|---|
| `/` | 295 273 o | 34 372 o (12 %) | **aucun** | **0** |
| `/properties` | 311 711 o | 47 608 o (15 %) | **aucun** | **0** |
| `/properties/[slug]` | 329 597 o | 41 065 o (12 %) | **aucun** | **0** |

Les trois pages sont des composants clients (`'use client'` sur `HomepageDiscovery`,
`PropertiesDiscoveryPage`, et sur `properties/[slug]/page.tsx` lui-même) dont les données arrivent
par `useEffect` + `apiFetch`. Le serveur envoie donc ~300 Ko pour ne rien montrer, puis le
navigateur télécharge le JS, hydrate, et *seulement ensuite* demande les annonces.

Temps mesurés en local, tout à chaud, latence réseau nulle :

- `/properties` : premier octet 78 ms, **première carte peinte 1 016 ms**
- clic résultat → fiche : **h1 visible après 923 ms**, en trois vagues d'appels API
  (`property-types` +262 ms → `properties/{slug}` +573 ms → `reviews` et `similar` +895 ms)

Ce sont trois cascades séquentielles, pas trois appels parallèles. Sur un réseau réel, chaque
vague ajoute un aller-retour complet.

**Le SEO tombe avec le rendu.** Aucune fiche de bien n'a de `<h1>`, de prix ni de description dans
le HTML initial, et aucune page ne porte de JSON-LD. Les métadonnées, elles, sont correctes :
`properties/[slug]/layout.tsx` fait bien son `generateMetadata` côté serveur — mais il **récupère
le bien et le jette** : la page cliente le redemande intégralement juste après. Chaque consultation
de fiche coûte donc deux fois le même bien, et la version serveur (qui, elle, passe des
`fields[properties]`) n'est jamais réutilisée.

### Le dictionnaire est inliné en entier, à chaque page

`src/i18n/request.ts` charge le dictionnaire complet (`fr.json` = **266 436 octets** ; en `wo`, il
fusionne `fr` + `wo`) et le passe en `messages`. next-intl le sérialise dans la charge RSC : c'est
l'essentiel des 88 % de scripts du tableau ci-dessus. Aucun découpage par espace de noms.

`getRequestConfig` appelle par ailleurs `cookies()`, `headers()` et `new Date()` : **aucune page ne
peut être rendue statiquement ni mise en cache en périphérie.** Chaque navigation touche le serveur
Node — pour un rendu qui ne contient aucune donnée.

### Deux `loading.tsx` pour 113 pages

```bash
find src/app -name loading.tsx | wc -l   # 2
find src/app -name page.tsx    | wc -l   # 113
```

`/properties` n'en a pas, et son `<Suspense>` est écrit **sans `fallback`**
(`src/app/(public)/properties/page.tsx`). Une navigation vers les résultats laisse donc la page
précédente figée jusqu'à ce que le nouveau rendu arrive.

---

## 5. Le retour arrière

Mesuré : `/` → `/properties?city=Dakar&bedrooms=3` → défilement à 1 200 px → clic sur une fiche →
bouton Précédent.

```
URL retrouvée      : /properties?city=Dakar&bedrooms=3        ✓
1re carte revisible: 822 ms
défilement restauré: 0 px          ← on repart du haut de la liste
appels API rejoués : la recherche est REFAITE intégralement
```

`useSearch` et `useProperty` sont des `useEffect` + `fetch` nus : **aucun cache, aucune
déduplication**. Revenir sur ses pas rejoue tout. TanStack Query est pourtant installé et utilisé
ailleurs dans le dépôt (`useApiQuery`, `useSuggest`) — c'est justement le hook de la surface la
plus parcourue qui ne s'en sert pas.

Second effet, plus brutal : `search()`, `setPage()`, `resetFilters()` et `removeFilter()` utilisent
tous **`router.replace`**. L'historique ne grandit donc jamais.

```
/properties → saisie d'un filtre → URL = /properties?city=Dakar&page=1
              history.length = 2  (inchangé)
              un « Précédent » quitte la page
```

Un utilisateur qui pose cinq filtres et appuie une fois sur Précédent ne revient pas au filtre
précédent : il sort de la recherche.

---

## 6. Constats secondaires, tous mesurés

- **`fields[properties]` est ignoré par `/search`.** La règle non négociable du dépôt (« sparse
  fieldsets obligatoires ») ne peut pas s'appliquer à son endpoint le plus chaud :
  `?fields[properties]=id,title` rend toujours **36 clés** par bien. `PropertySearchService`
  construit la ressource directement, hors `HasQueryBuilder`. La liste transporte notamment
  `approved_at`, `submitted_at`, `rejection_reason` sur une surface publique.
- **Les libellés sont français en dur, quelle que soit la langue.**
  `PropertyResource::translate()` fait `Lang::get($key, [], 'fr')` — le troisième argument fige la
  locale. Mesuré : `Accept-Language: en`, `wo` et `fr` rendent tous `« À louer »`, alors que
  `lang/en/properties.php` contient bien `'rent' => 'For Rent'`. `SetLocaleMiddleware` négocie
  correctement ; c'est la ressource qui l'ignore.
- **`apiFetch` ne transmet pas `Accept-Language`** (contrairement à `apiRequest`) — donc même une
  fois le point précédent corrigé, la page de résultats et la fiche resteraient dans la locale par
  défaut du serveur.
- **Aucune mise en cache HTTP sur le catalogue public.** `/search` répond
  `Cache-Control: no-cache, private`, sans `ETag`. Deux visiteurs anonymes qui demandent la même
  page de résultats la font recalculer deux fois. (`/search/suggest`, lui, pose bien
  `max-age=60, public`.)
- **Compression non vérifiée.** `php artisan serve` ne compresse pas ; la configuration du serveur
  de production n'est pas dans le dépôt. À mesurer sur `preview.api.takussan.com` avant d'en
  conclure quoi que ce soit.
- **`views_count` vaut 0 partout** dans le jeu de démonstration (`favorites_count`, lui, remonte
  correctement — vérifié sur le bien 5). Le tri « popularité » n'est donc jamais exerçable en
  développement.
- **`hydrate()` réapplique `scopePublic()` après le moteur.** C'est une défense en profondeur
  légitime, mais elle peut rendre moins d'éléments que `per_page` sans que `meta.total` ne le
  reflète : si l'index diverge de la base, la page se creuse en silence.
- **Le catalogue est en dehors du filet de la CI côté production** : le front public
  (`www.takussan.com`) porte `NEXT_PUBLIC_API_URL = https://api.takussan.com`, hôte qui rend 404
  (TCK-332 / D-04). Tant que ce point tient, aucune des mesures ci-dessus ne décrit ce que voit un
  vrai visiteur — il ne voit rien du tout.

---

## Ce qui marche, et qu'il ne faut pas casser

- **Une seule requête moteur** porte filtres, facettes, géo, tri et pagination
  (`PropertySearchService::search()`), et `meta.total` est le compte filtré exact — pas une
  estimation post-filtrage.
- **Tolérance à la faute effective** : `apartement` rend les 35 mêmes biens que `appartement`.
- **Préfixe du dernier terme** : `almadie` rend les 8 mêmes biens que `Almadies`.
- **Filtres insensibles à la casse** : `city=dakar`, `Dakar`, `DAKAR` → 210 biens chacun.
- **Filtres qui marchent** : `contract_type` (204 / 54), `rent_period` (61), `city`, `location`,
  `price_min`/`price_max`, `bedrooms` (43), `bathrooms`, `floor_number` (13), `type` (24 terrains),
  `sort`, `page`/`per_page`.
- **L'autocomplétion est débouncée (150 ms), mise en cache (`staleTime` 60 s), navigable au
  clavier, annotée ARIA, et limitée à 60 requêtes/minute par IP.** C'est le morceau le plus soigné
  de la chaîne.
- **Le tri par défaut est correct** : sans terme, `featured:desc, published_at:desc` ; avec terme,
  on laisse la pertinence du moteur décider.

---

## Ordre de traitement suggéré

| # | quoi | pourquoi d'abord |
|---|---|---|
| 1 | `furnished` : accepter `"true"`/`"false"` (`in:true,false,1,0` + cast) | un filtre courant rend 422 et affiche « 0 bien » |
| 2 | Ajouter `area_min`, `area_max`, `featured` aux règles **et** à `buildFilter()` | l'interface affirme des filtres inexistants, jusque dans le pied de page |
| 3 | Anti-rebond (300–400 ms) sur les champs libres du panneau de filtres | ÷5 sur les requêtes, et fin du clignotement « aucun résultat » |
| 4 | Assouplir `available_from` (retirer `after_or_equal:today`, ou borner côté service) | les recherches sauvegardées et les liens partagés pourrissent |
| 5 | Faire passer `useSearch` par TanStack Query | retour arrière instantané au lieu de 822 ms |
| 6 | Synonymes + mots vides Meilisearch, et alias d'intention indexés | « villa à louer à Saly » doit filtrer, pas seulement classer |
| 7 | Rendre `/properties` et la fiche côté serveur (page serveur + `searchParams`) | ni SEO ni premier rendu aujourd'hui ; supprime aussi le double appel de la fiche |
| 8 | `Lang::get(..., 'fr')` → locale active, et `Accept-Language` dans `apiFetch` | `en` et `wo` reçoivent du français |
| 9 | Découper le dictionnaire next-intl par espace de noms | 266 Ko inlinés à chaque page |
| 10 | `router.push` (au lieu de `replace`) au moins pour les changements de filtre | le bouton Précédent ne doit pas éjecter du site |

Les points 1, 2 et 4 sont des corrections d'une ligne à quelques lignes qui changent ce que
l'utilisateur obtient. Le point 6 est le seul qui demande une vraie décision de conception (analyse
d'intention côté service, ou vocabulaire injecté dans l'index, ou les deux) — il mérite un ADR.
