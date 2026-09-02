---
id: TCK-506
title: "Recherche publique — le vocabulaire immobilier (F4, chambre salon, R+1, TF, m²) dérivé des colonnes et indexé, index seulement"
status: todo
phase: P0
family: back
estimate: M
wave: 60
created: 2026-09-02
updated: 2026-09-02
depends_on: [TCK-335, TCK-491]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
tags: [back, search, meilisearch, vocabulary, properties, seed]
---

## Objectif utilisateur

Un visiteur qui tape « appartement F4 », « 3 chambres salon », « villa R+1 » ou « terrain TF
300 m2 » trouve les biens qui **sont** cela d'après leurs colonnes, que l'annonceur l'ait écrit
ou non dans le titre ou la description.

## Contrat de données

**Prémisse remesurée le 2026-09-02** sur l'index local (`takussan_localproperties`, 252 biens
publics, stratégie `all`, celle de `PropertySearchService`). `description` est **déjà** en
troisième position de `searchableAttributes` : le cas « F4 dans la description, pas dans le
titre » est couvert. Le trou est ailleurs, et il est de vocabulaire :

| Requête | Hits | Lecture |
|---|---|---|
| `F4` | 8 | seuls les biens dont le **texte** dit « F4 » ; 15 appartements ont `bedrooms = 4` |
| `T4` | 2 (parasites) | T4 et F4 sont deux mots étrangers l'un à l'autre |
| `appartement 4 pieces`, `chambre salon`, `duplex`, `rdc`, `sdb`, `villa basse`, `titre foncier`, `TF`, `150 m2` | 0 | vocabulaire courant du marché sénégalais, absent de l'index |
| `appart F4` | 0 | `appart` n'est complété que s'il est le **dernier** mot de la requête |
| `R+2` | 0 | le `+` sépare : le document doit porter « R+2 » **et** « R 2 » |
| `m²` | normalisé en `m2` | émettre `m2` suffit |

Le moteur connaît « F4 » comme **un** jeton (`F5` : 4 hits exacts) ; `oneTypo` est à 5
caractères, donc aucun de ces jetons courts n'a droit à une approximation (TCK-335). Les
synonymes de l'index sont vides et **le restent** : un document qui porte lui-même chaque
variante n'en a pas besoin.

**Ce que les colonnes permettent de dériver**, taux de remplissage mesurés sur la base locale :
`bedrooms`, `area`, `parking_spaces`, `year_built` 97 à 100 % ; `floor_number`, `total_floors`
62 % ; `rent_period` 100 % des locations ; `title_type` 0 % (mais saisissable depuis TCK-464 et
indexé depuis TCK-491) ; `lot_position`, `level`, `metadata` vides ou inexploitables — **hors
périmètre**.

⚠ **Le seed pose des chambres sur des types non habitables** (moyenne 3,2 sur `land`, 2,8 sur
`warehouse`) et ses gabarits de titre écrivent `F{bedrooms}` (`SenegalFakerProvider.php:61-65`),
soit **F4 pour 4 chambres** — l'inverse de la convention retenue ci-dessous. Tout champ dérivé est
donc **gardé par le type**, et le seed est aligné dans ce ticket.

### Convention retenue (décision produit du 2026-09-02)

**F(n) = chambres + 1, le salon compté.** Un studio est F1, « chambre salon » est F2,
« 3 chambres salon » est F4. T(n) est synonyme de F(n).

### Trois champs dérivés, calculés dans `App\Support\Search\PropertyLabels`

Classe **pure** (aucun accès base, aucune dépendance au conteneur), appelée par
`Property::toSearchableArray()`. Jamais saisis, jamais stockés : recalculés à chaque indexation,
donc toujours cohérents avec les chiffres.

**1. `rooms_label`** — émis uniquement pour `apartment`, `house`, `villa`, `studio` ; chaîne vide
sinon. Sans diacritiques : le moteur les replie (mesuré TCK-339).

| Cas | Jetons émis |
|---|---|
| `studio`, ou `bedrooms = 0` | `F1 T1 studio 1 piece` |
| `bedrooms = 1` | `F2 T2 2 pieces 1 chambre chambre salon` |
| `bedrooms = n ≥ 2` | `F{n+1} T{n+1} {n+1} pieces {n} chambres {n} chambres salon` |
| `bedrooms = null` (type habitable) | chaîne vide |

**2. `facts_label`** — un seul champ, **en dernière position** de `searchableAttributes` comme les
champs de TCK-335 : un mot de fait élargit le rappel, il ne réordonne jamais la pertinence.

| Source | Condition | Jetons émis |
|---|---|---|
| `total_floors = n` | `house`, `villa` | `R+{n} R {n}` ; `villa basse plain-pied` si n = 0 |
| `floor_number` | `apartment`, `office`, `studio`, `room` | `rez-de-chaussee rdc` si 0 ; `etage {n} {n}e etage` sinon |
| `bathrooms = n ≥ 1` | types habitables | `{n} sdb {n} salle de bain salles de bain` |
| `parking_spaces ≥ 1` | tous | `parking garage` |
| `area = n` | tous | `{n} m2` ; **plus** `{n/10000} ha hectare` si n ≥ 10 000 |
| `title_type` | `land`, `farm`, `house`, `villa` | `titre foncier TF` / `bail` / `deliberation` ; rien pour `autre` ou `null` |
| `rent_period` | `contract_type = rent` | `par jour journalier courte duree` / `par semaine hebdomadaire` / `par mois mensuel` / `par an annuel` |
| `year_built` | année courante ou précédente | `neuf` ; rien sinon |

**3. `derived_title`** — un titre alternatif écrit depuis les colonnes, **index seulement**
(décision produit du 2026-09-02 : ni exposé par l'API, ni affiché). Une grammaire par famille de
type, chaque segment tombant s'il est absent, le lieu suivant la règle « quartier, ville » →
« ville » → rien :

| Famille | Gabarit | Exemple |
|---|---|---|
| habitation (`apartment`, `house`, `villa`, `studio`, `room`) | `{Type} {F(n)} {meublé} {R+n} à {quartier}, {ville}` | `Appartement F4 meublé à Médina, Dakar` |
| foncier (`land`, `farm`) | `{Type} {area} m² {titre foncier / bail / délibération} à {quartier}, {ville}` | `Terrain 300 m² titre foncier à Keur Massar, Dakar` |
| professionnel (`office`, `shop`, `warehouse`, `factory`, `garage`, `parking`, `hotel`, `resort`, `other`) | `{Type} {area} m² à {quartier}, {ville}` | `Bureau 120 m² à Plateau, Dakar` |

Le libellé de type est celui de `lang/fr/properties.php` (`type.*`) — **lu**, pas recopié. Le
contrat (`à louer` / `à vendre`) n'y figure pas : `contract_label` le porte déjà.

### Position dans `searchableAttributes` — mesurée, pas déduite

`derived_title` est discriminant **par bien** ; il se place juste après `title`. `rooms_label` et
`facts_label` sont des champs de vocabulaire ; ils se placent **en fin**, après `furnished_label`.
Le test de TCK-335 qui interdit de réordonner la pertinence
(`PropertySearchVocabularyTest::test_le_vocabulaire_elargit_le_rappel_sans_reordonner_la_pertinence`)
est l'arbitre : s'il rougit avec `derived_title` en deuxième position, le champ descend après
`description`, et la mesure est consignée dans les notes.

### Alias de type enrichis (`Property::TYPE_SEARCH_ALIASES`)

`apartment` + `appart` · `land` + `parcelle lot` · `warehouse` + `depot hangar` · `shop` +
`local commercial` · `office` + `plateau de bureaux` · `room` + `colocation` · `hotel` + `auberge
lodge campement` · `farm` + `verger champ`.

⚠ **Chaque alias passe par la mesure de collision de corpus imposée par TCK-339** avant
d'être adopté : `magasin` envoyait les chercheurs d'entrepôt sur des boutiques avec un compte qui
avait l'air juste. `local` et `plateau` sont les deux candidats à risque — Plateau est un
quartier. Un alias dont la sonde solo rend majoritairement un **autre** type est écarté, et le
relevé est consigné.

## Direction UX / Artistique

Sans objet : aucun affichage n'est ajouté ni modifié. `derived_title` n'est pas une donnée
d'interface.

## Contraintes strictes (métier)

1. **Gardé par le type.** Un terrain n'émet jamais de `rooms_label`, un appartement jamais de
   « R+n » ni de statut foncier. La table des types est fermée et couvre **toutes** les valeurs de
   `PropertyType` — même invariant que `test_les_tables_dalias_couvrent_exactement_les_valeurs_denum`.
2. **Un champ dérivé ne s'écrit jamais en base et ne sort jamais de l'API.** Ni colonne, ni
   attribut de `PropertyResource`, ni `fields[properties]`.
3. **Aucun synonyme moteur.** `config/scout.php` ne déclare pas de `synonyms` : la redondance
   vit dans le document.
4. **Le vocabulaire wolof reste hors de ce ticket.** Les deux tables `*_WO` de TCK-339 gardent
   leur mécanique ; `PropertyLabels` n'y touche pas.
5. **Un alias ne s'adopte que mesuré** (cf. collision de corpus ci-dessus). Aucune migration :
   la colonne `bedrooms` et les enums existent.
6. **Réindexation obligatoire au déploiement**, après `scout:sync-index-settings` : sans elle,
   les documents ne portent pas les champs et rien ne rougit. `scripts/deploy.sh` déclenche déjà
   l'import de `Property` sur un diff de `app/Models/*.php` — vérifier que le diff de
   `app/Support/Search/PropertyLabels.php` **seul** le déclenche aussi, sinon étendre le motif.

## Delta à produire

**Backend, prescriptif**

- [ ] `app/Support/Search/PropertyLabels.php` — classe pure, trois méthodes statiques
      `rooms(Property): string`, `facts(Property): string`, `title(Property): string`, plus la
      table fermée `FAMILLES` (type → habitation / foncier / professionnel).
- [ ] `Property::toSearchableArray()` : `+ 'rooms_label'`, `+ 'facts_label'`, `+ 'derived_title'`.
- [ ] `Property::TYPE_SEARCH_ALIASES` : alias enrichis, **après** mesure de collision.
- [ ] `config/scout.php`, index `properties` : `derived_title` après `title`, `rooms_label` et
      `facts_label` en fin de `searchableAttributes` ; commentaire portant la mesure de position.
- [ ] `database/seeders/Support/SenegalFakerProvider.php` : gabarits `F{bedrooms}` → F(chambres + 1)
      ; `PropertyFactory` : `bedrooms`, `bathrooms`, `floor_number` à `null` pour les types non
      habitables.
- [ ] `scripts/deploy.sh` : motif de réimport étendu à `app/Support/Search/` si nécessaire.
- [ ] Tests unitaires `tests/Unit/PropertyLabelsTest.php` — en table, un cas par ligne des trois
      grilles ci-dessus, plus les cas nuls (`bedrooms = null`, sans adresse, sans ville).
- [ ] Tests unitaires `tests/Unit/PropertySearchableArrayTest.php` — les trois champs présents,
      `test_tout_champ_de_vocabulaire_est_declare_searchable` étendu, la table `FAMILLES` couvre
      exactement `PropertyType`.
- [ ] Tests moteur `tests/Feature/Search/PropertySearchVocabularyTest.php` — un scénario par
      requête du tableau de prémisse (`F4`, `T4`, `4 pieces`, `chambre salon`, `villa R+1`,
      `terrain TF`, `rdc`, `appart`), chacun **vérifié par ablation** du champ qui le sert.
- [ ] Notes d'implémentation : relevé de collision par alias, position mesurée de
      `derived_title`, temps de réindexation (méthode de TCK-491 : hôte surchargé sur la ligne
      de commande, `SCOUT_QUEUE=false`, attente de `/tasks` à 0).

## Critères d'acceptation

- [ ] **AC1** — `q=F4` en stratégie stricte rend **tous** les biens habitables publics à
      3 chambres, y compris un bien dont ni le titre ni la description ne contiennent « F4 » ;
      **et ne rend aucun** bien à 4 chambres. *(Le second membre est ce qu'une convention inversée
      cocherait.)*
- [ ] **AC2** — `q=T4`, `q=4 pieces`, `q=3 chambres salon` rendent exactement le même ensemble
      que `q=F4`.
- [ ] **AC3** — `q=chambre salon` rend les biens habitables à 1 chambre et **aucun** studio ;
      `q=studio` continue de rendre les studios.
- [ ] **AC4** — `q=villa R+1` rend les villas à `total_floors = 1` ; `q=terrain TF` rend les
      terrains à `title_type = titre_foncier` et aucun terrain en `bail`.
- [ ] **AC5** — Un terrain à `bedrooms = 3` (fixture délibérée) n'est **pas** rendu par `q=F4`.
- [ ] **AC6** — Retirer `rooms_label` de `toSearchableArray()` fait rougir AC1 à AC3 ; retirer
      `facts_label` fait rougir AC4 : l'ablation est jouée et consignée.
- [ ] **AC7** — L'ordre de pertinence mesuré par TCK-335 est inchangé : le test
      `..._sans_reordonner_la_pertinence` reste vert avec les trois champs en place.
- [ ] **AC8** — Ni `derived_title`, ni `rooms_label`, ni `facts_label` n'apparaissent dans une
      réponse de `GET /api/public/properties/search`, `show`, ni `GET /api/properties`.
- [ ] **AC9** — Après `migrate:fresh --seed`, aucun bien de type `land`, `warehouse`, `office`,
      `shop`, `garage`, `parking`, `factory` ne porte de `bedrooms`, et tout titre seedé
      « F{n} » correspond à `bedrooms = n − 1`.
- [ ] **AC10** — `./vendor/bin/pint --test` et `php artisan test` verts ; le temps de
      réindexation est consigné avec sa commande et sa date.

## Hors périmètre

- Exposer ou afficher `derived_title` (formulaire d'annonce, sous-titre de carte, SEO) —
  décision explicite du 2026-09-02, à rouvrir dans un ticket propre si le besoin naît.
- Les synonymes Meilisearch et la baisse de `minWordSizeForTypos` : la redondance est portée
  par le document ; la tolérance aux fautes est un réglage de TCK-335.
- Le wolof des pièces et des faits (« néég », etc.) : TCK-339, bloqué faute de relecteur.
- L'analyse de la requête côté API (« F4 » → `filter[bedrooms]`) : piste 3 de l'étude, à
  n'ouvrir que si le rappel par champ dérivé ne suffit pas, mesuré.
- `lot_position`, `level`, `metadata` : vides en base, rien à en dériver aujourd'hui.
- « duplex », « triplex » : aucune colonne ne les porte ; ils resteraient un mot de texte libre.
- Le port Meilisearch du `.env` local (7700 au lieu de 7701) : dette D-48, nommée par
  `./dev.sh doctor`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
