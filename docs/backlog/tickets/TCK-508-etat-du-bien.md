---
id: TCK-508
title: "État du bien (sur plan, neuf, rénové, bon état, à rénover) : colonne déclarée, filtre public, badge, et « neuf » dérivé de la colonne"
status: review
phase: P1
family: full
estimate: M
wave: 62
created: 2026-09-10
updated: 2026-09-11
depends_on: [TCK-506]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
tags: [back, front, properties, search, meilisearch, i18n, seed]
---

## Objectif utilisateur

Un visiteur qui cherche un logement neuf ou vendu sur plan le trouve, le filtre et le reconnaît
au premier coup d'œil — parce que l'agent l'a **déclaré**, au lieu que le produit le devine
depuis l'année de construction.

## Contrat de données

- Colonne `properties.condition`, enum `PropertyCondition` — valeurs et sens : spec §3 Property
  et table des enums. **Nullable, et « non renseigné » le reste** : aucun remplissage rétroactif
  des biens existants.
- Sans objet pour la famille foncière (`land`, `farm`) : jamais émise ni affichée pour ces types.
- Écriture : `POST /api/properties`, `PUT /api/properties/{id}` (existants).
- Lecture : `PropertyResource` émet `condition` (colonne, donc sous `whenHas`, ADR-0021) et
  `condition_label` (dérivé, localisé).
- Tableau de bord : `filter[condition]=` et `fields[properties]=…,condition` via `HasQueryBuilder`.
- Recherche publique : `GET /api/public/properties/search?condition=new,off_plan` — liste de
  valeurs, OU entre elles, ET avec les autres filtres.
- Index Meilisearch : `condition` filtrable ; le jeton `neuf` de `facts_label` (TCK-506) dérive
  désormais de la colonne.

## Direction UX / Artistique

- **Seuls `new` (« Neuf ») et `off_plan` (« Sur plan ») méritent un badge** : ce sont des
  arguments de vente. `renovated`, `good` et `to_renovate` figurent dans les caractéristiques de
  la fiche, jamais en pastille — « À rénover » posé sur une photo de carte serait un repoussoir,
  pas une information.
- Filtre : choix multiples dans le panneau des filtres avancés, rappelé par la pastille habituelle
  quand il est actif.
- Formulaire : « État du bien » parmi les caractéristiques, masqué pour un terrain ou une ferme,
  avec une option « Non précisé ».
- Palette, cartes et badges : `docs/design-guidelines.md` et les jetons existants — aucune
  couleur nouvelle.

## Contraintes strictes (métier)

1. **La colonne gagne sur l'année.** `neuf` est émis si `condition ∈ {new, off_plan}`. Si
   `condition` porte une autre valeur, `neuf` n'est **pas** émis, même pour un bien construit
   l'an dernier. La règle `year_built ≥ année − 1` de TCK-506 ne sert plus que de **repli**,
   quand `condition` est nulle.
2. **Un terrain n'a pas d'état.** Invariant de modèle : un bien de la famille foncière est
   enregistré avec `condition = null`, y compris quand un changement de type le fait basculer
   (villa → terrain). La liste des types sans état est définie **une** fois côté back ; le front
   la reflète.
3. **Une valeur inconnue rend 422**, jamais un filtre ignoré en silence — à l'écriture comme sur
   la recherche publique (même règle que `title_type`, TCK-491).
4. **Un bien sans état ne satisfait aucun filtre d'état** — on ne promet pas ce que la donnée ne
   dit pas (même règle que `title_type`).
5. `InventoryCondition` n'est **pas** réutilisé : il décrit un état des lieux, pas une annonce.
6. Enum en `string` et contrôle applicatif (ADR-0007) — aucun `enum()` SQL.
7. `year_built` : la création applique les bornes de la modification (1800–2100) ;
   `StorePropertyRequest` n'en impose aucune aujourd'hui.

## Delta à produire

Back :

- [x] Enum `App\Models\Enums\PropertyCondition` (5 cas) + `appliesTo(PropertyType|string|null): bool`.
- [x] Migration `2026_09_10_100000_add_condition_to_properties_table` — `string('condition', 20)->nullable()`, `down()` qui la retire.
- [x] `Property` : `$fillable`, `$casts`, `$requestFilterable`, `$queryFields`, invariant `saving` (contrainte 2), `toSearchableArray()['condition']`.
- [x] `config/scout.php` : `condition` dans les `filterableAttributes` de Property.
- [x] `PropertyLabels::facts()` : contrainte 1. `RefreshNewBuildSearchLabel::scope()` restreint aux biens sans `condition` — les seuls dont le jeton dépend encore du temps.
- [x] `StorePropertyRequest` / `UpdatePropertyRequest` : `condition` par `Rule::enum` ; `year_built` borné à la création.
- [x] `SearchPublicPropertyRequest` : `condition`, liste de valeurs validées une à une ; `PropertySearchService::buildFilter()` : OU entre les valeurs.
- [x] `PropertyResource` : `condition` + `condition_label` ; `lang/{fr,en,wo}/properties.php` : groupe `condition`.
- [x] Seed : `PropertySeeder` pose un état cohérent avec `year_built` sur les biens bâtis — dont des `new` et `off_plan` récents, pour que `q=neuf` soit enfin observable sur un jeu de démonstration ; `FilterCoverageSeeder` couvre chaque valeur.
- [x] Tests : `PropertyConditionTest` (Unit — `appliesTo`, et sa parité avec la famille foncière de `PropertyLabels`), `PropertyLabelsTest` (neuf dérivé), `RefreshNewBuildSearchLabelTest` (périmètre), `PropertyWritableFieldsTest` (écriture, 422, invariant terrain, bornes `year_built`), `PublicPropertySearchFiltersTest` (filtre multi, 422, bien sans état exclu), `PropertySearchableArrayTest` (forme du document).

Front :

- [x] Type, liste de valeurs et libellés `condition` (fr/en/wo), alignés sur l'enum back.
- [x] Formulaire d'édition et assistant de création : le champ, masqué pour la famille foncière.
- [x] Filtre public multi-valeurs relié à `condition=` et à sa pastille.
- [x] Badge « Neuf » / « Sur plan » sur les cartes publiques et sur la fiche ; l'état complet dans les caractéristiques de la fiche.
- [x] Tests vitest des surfaces touchées.

Docs :

- [x] `docs/features-by-actor.md` régénéré (dérivé de `features.md`).

## Critères d'acceptation

- [x] AC1 — `POST /api/properties` avec `condition=off_plan` persiste la valeur ; `condition=nimportequoi` rend 422 ; `year_built=99999` rend 422 à la création comme à la modification.
- [x] AC2 — Un terrain envoyé avec `condition=new` est enregistré à `null` ; une villa `new` passée en terrain perd son état.
- [x] AC3 — `GET /api/public/properties/search?condition=new,off_plan` rend exactement les biens publics `new` et `off_plan` — ni les `good`, ni les biens sans état ; `condition=foo` rend 422.
- [x] AC4 — `q=neuf` rend un bien `condition=new` construit en 1998, ne rend **pas** un bien `condition=good` construit l'an dernier, et rend toujours un bien **sans** état construit l'an dernier (repli).
- [x] AC5 — `PropertyResource` rend `condition` et `condition_label` localisé ; une lecture dont `fields[properties]` omet `condition` ne l'émet pas.
- [x] AC6 — Site public : un bien `new` porte « Neuf » sur sa carte et sa fiche ; un bien `to_renovate` ne porte aucun badge mais son état figure dans les caractéristiques ; cocher « Neuf » dans le filtre ajoute `condition=new` à l'URL et à la requête API, et la pastille le rappelle.
- [x] AC7 — Le champ n'apparaît pas dans le formulaire d'un terrain.
- [x] AC8 — Sur un jeu de démonstration fraîchement seedé, `q=neuf` et `?condition=new` rendent chacun au moins un bien — mesuré sur l'API, pas déduit du seeder.

## Hors périmètre

- Le parcours « programme sur plan » : date de livraison, échéancier par tranches, avancement du chantier.
- Des jetons de recherche pour `renovated` / `to_renovate` : « renove » et « renover » sont à une lettre l'un de l'autre et au-dessus du seuil `oneTypo` (5 caractères) — indexer l'un rendrait l'autre. À mesurer avant d'indexer quoi que ce soit.
- Le filtre de la carte (`GET /api/public/properties/map`) : elle ne porte aujourd'hui ni `furnished` ni `title_type` ; l'aligner sur la liste est un ticket à part.
- Les recherches sauvegardées et leurs alertes.
- Le passage automatique `new` → `good` après une première location ou vente.

## Notes d'implémentation

**Décisions (2026-09-11)**

- **L'invariant « un terrain n'a pas d'état » vit dans le hook `saving` du modèle**, pas dans les
  FormRequest : une modification peut changer le TYPE seul (villa → terrain), et la règle doit
  tenir alors aussi. Les FormRequest acceptent donc `condition` pour tout type. ⚠
  `Property::withoutEvents()` le contourne : `PropertySeeder` porte sa propre garde par famille.
- **Une seule frontière** : `PropertyCondition::appliesTo()` délègue à `PropertyLabels::famille()`.
  Le front la reflète (`field-matrix.ts`, clé `condition`), et `field-matrix.test.ts` lit
  `PropertyLabels.php` pour garder la parité ; `web-ci.yml` déclenche désormais sur ce fichier.
- **Recherche publique** : la liste est validée valeur par valeur (une valeur inconnue derrière une
  valide rend 422), OU entre les valeurs dans `buildFilter()`. `validation.in` n'existe pas dans
  `lang/fr/validation.php` : le message retombe sur celui du framework, comme pour les autres
  règles d'enum du dépôt.
- **`neuf` (TCK-506)** : la colonne gagne ; `year_built` n'est plus qu'un repli quand `condition`
  est nulle. `RefreshNewBuildSearchLabel` ne ré-indexe plus que les biens SANS état — les seuls
  dont le jeton dépend encore du calendrier.
- **Formulaire d'édition** : l'option « Non précisé » vaut `''`, que le schéma zod transforme en
  `null` — elle EFFACE en base. Une clé absente de la lecture reste `undefined` et n'est pas
  envoyée : rien n'est effacé à l'aveugle. Assistant de création : pastille désélectionnable, comme
  le statut foncier.
- **Badge** : plaque OPAQUE `bg-card text-foreground` à côté de la pastille de contrat, sur les cinq
  cartes publiques (aucune couleur nouvelle, contraste indépendant de la photo) ; `Badge`
  secondaire dans l'en-tête de la fiche ; l'état complet — cinq valeurs — dans ses
  caractéristiques.
- **Filtre** : clé multi-valuée dans `SEARCH_FILTER_KEYS`, sur le patron de `type` (une puce par
  valeur, retrait par sous-clé), pastilles dans la section « État du bien » du panneau. La
  canonique l'écarte d'elle-même (partition dérivée). `/map` n'est pas touché (hors périmètre).

**Écarts assumés**

- **`wo` porte des libellés FRANÇAIS**, côté back comme côté front, en attendant la validation d'un
  locuteur natif — même choix que « Titre foncier ». `check:i18n` ne voit pas la différence : il
  contrôle la présence des clés, pas leur langue.
- **Cliquet des encres inverses 155 → 156** : les pastilles du filtre reprennent les classes des
  pastilles de type, déjà comptées ; le site est nommé dans `surface-publique.contraste.test.ts`.
- **Les specs (`features.md`, `models-spec.md`) sont modifiées dans la même PR que le code**, à la
  demande de l'utilisateur (ticket écrit et implémenté d'un seul geste).
- `deploy.sh` réimporte tous les modèles quand `config/scout.php` change : le nouvel attribut
  filtrable sera posé au déploiement, sans geste manuel.

**Vérifications**

- Back : les 8 fichiers de test touchés, 124 tests verts. Ablation : invariant du modèle retiré →
  2 rouges (terrain, villa → terrain) ; filtre du service retiré → 1 rouge.
- Front : `tsc` propre, ESLint 0 erreur, `check:i18n` vert, suite entière 3183 / 3183 (380
  fichiers). Gardes racine : 40 / 41, la 41ᵉ étant l'INDEX, régénéré au passage en `review`.
- **Suite back entière (2026-09-11)** : 3137 verts, 2 ignorés, 0 échec, 10 396 assertions, en
  619,51 s — **sous charge**, ce n'est pas un temps de référence : `uptime` au départ
  35,26 / 43,61 / 34,02, à l'arrivée 3,58 / 10,61 / 20,28, sur 8 cœurs.
- AC1, AC2, AC4, AC5 sont tenus par les tests back (`PropertyWritableFieldsTest`,
  `PropertyDerivedVocabularyTest`, `PropertyResourceSparseFieldsTest`,
  `PublicPropertySearchFiltersTest`) ; AC3, AC6, AC7, AC8 ont été relevés en plus sur l'API vivante
  et au navigateur, ci-dessous.
- **API vivante et navigateur (2026-09-11)**, sur une base ISOLÉE fraîchement seedée
  (`takussan_tck508`, index Meilisearch `tck508_*` — la base `takussan` et l'index
  `takussan_local` de l'utilisateur n'ont pas été touchés). Répartition seedée : 106 `new`,
  54 `off_plan`, 87 `renovated`, 190 `good`, 45 `to_renovate`, 374 sans état (terrains compris).
  - AC8 : `q=neuf` → **61** biens publics ; `?condition=new` → **40**.
  - AC3 : `condition=new,off_plan` → 61 = 40 `new` + 21 `off_plan`, aucun autre état ;
    `condition=foo` et `condition=new,foo` → 422.
  - ⚠ Les 61 de `q=neuf` sont TOUS `new` ou `off_plan` : le repli par `year_built` (bien sans
    état, construit récemment) n'est pas exercé par le jeu de démonstration. Seul
    `PropertyDerivedVocabularyTest` l'exerce (AC4).
  - AC6 : fiche d'un `new` → badge « Neuf » dans l'en-tête et ligne « État du bien : Neuf » ;
    fiche d'un `to_renovate` → aucun badge d'état, ligne « État du bien : À rénover ». Liste sans
    filtre : 5 pastilles « Sur plan » sur 30 cartes — exactement les 5 `off_plan` que l'API rend
    en page 1, et aucune pastille pour ses 2 `to_renovate`, 5 `renovated` et 10 `good`. Clic sur
    « Neuf » dans le panneau → URL `?condition=new`, requête navigateur
    `GET /api/public/properties/search?condition=new&page=1&per_page=30`, bouton
    `aria-pressed=true`, pastille « Neuf » dans la barre d'outils, 30 cartes sur 30 portant
    « Neuf ».
  - AC7 : formulaire d'édition du terrain #92 → 14 champs, pas d'« État du bien » ; témoin
    positif, maison #29 → le champ est présent.
  - Méthode : Chrome headless à profil jetable piloté par CDP direct (le MCP chrome était tenu
    par une autre session). ⚠ Le premier relevé des cartes était un faux négatif : il ne lisait
    que les feuilles du DOM, et la pastille porte un point `<span>` à côté de son texte. Relu sur
    le texte propre de chaque élément.

### Règle implementation specs

| Côté | Niveau de prescription |
|------|----------------------|
| **Backend** (Laravel) | **Prescriptif** : noms de migrations, contrôleurs, routes, FormRequests, Policies, noms de tests |
| **Frontend** (Next.js) | **Intentionnel** : reprendre Direction UX + Contrat de données + Contraintes strictes. Ne jamais prescrire noms de composants, structure de dossiers, choix de state management, bibliothèques UI |
