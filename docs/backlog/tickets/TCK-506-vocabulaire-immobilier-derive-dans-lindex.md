---
id: TCK-506
title: "Recherche publique — le vocabulaire immobilier (F4, chambre salon, R+1, TF, m²) dérivé des colonnes et indexé, index seulement"
status: doing
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
| `studio`, ou `bedrooms = 0` | `F1 T1 studio` |
| `bedrooms = 1` | `F2 T2 1 chambre salon` |
| `bedrooms = n ≥ 2` | `F{n+1} T{n+1} {n} chambres salon` |
| `bedrooms = null` (type habitable) | chaîne vide |

⚠ **Pas de « {n+1} pieces », et c'est une décision de mesure, pas un oubli.** Un document est un
sac de mots : un bien à 3 chambres qui porterait « 4 pieces 3 chambres » contient les chiffres
**3 et 4**, et `q=4 chambres` le rendrait, comme `q=4 pieces` rendrait le bien à 4 chambres
(« 5 pieces 4 chambres »). Chaque chiffre nu présent dans un document habitable dégrade la
précision de « N chambres », la requête la plus courante du marché. Le document ne porte donc
qu'**un** chiffre de pièces : celui des chambres. « F4 » et « T4 » sont des jetons entiers (mesuré :
`q=F4` ne rend pas les titres qui portent « 4 »). « 4 pièces » n'est pas couvert ; il tombe sur le
repli de TCK-338, qui le dit.

**2. `facts_label`** — un seul champ, **en dernière position** de `searchableAttributes` comme les
champs de TCK-335 : un mot de fait élargit le rappel, il ne réordonne jamais la pertinence.

| Source | Condition | Jetons émis |
|---|---|---|
| `total_floors = n` | `house`, `villa` | `R+{n}`, borné à R+10 ; `villa basse plain-pied` si n = 0. **« R+n » est UN jeton, par le `dictionary` de l'index** (voir ci-dessous) |
| `floor_number` | `apartment`, `office`, `studio`, `room` | `rez-de-chaussee rdc` si 0 ; `{n}e etage {n}eme etage` sinon — **jamais le chiffre nu** |
| `bathrooms ≥ 1` | types habitables | `sdb salle de bain salles de bain` — **sans le compte**, même raison que les pièces |
| `parking_spaces ≥ 1` | tous | `parking garage` |
| `area = n` | tous | `{n} m2` ; **plus** `{n/10000} ha hectare` si n ≥ 10 000 |
| `title_type` | `land`, `farm`, `house`, `villa` | `titre foncier TF` / `bail` / `deliberation` ; rien pour `autre` ou `null` |
| `rent_period` | `contract_type = rent` | `par jour journalier courte duree` / `par semaine hebdomadaire` / `par mois mensuel` / `par an annuel` |
| `year_built` | année courante ou précédente | `neuf` ; rien sinon |

⚠ **« R+1 » n'est un jeton entier que par le réglage `dictionary` de l'index** (`config/scout.php`,
`R+0`…`R+10` dans les **deux casses**). Sans lui, le `+` sépare, « 1 » devient un chiffre nu et
`q=1 chambre` rend les villas R+1 ; pire, le **dernier mot d'une requête est complété par préfixe,
chiffres compris** : `q=villa R+1` rendait la villa basse de 150 m² (mesuré le 2026-09-02, sonde
sur index jetable). Le dictionnaire est sensible à la casse avant le repli du moteur — sans « r+1 »,
une requête en minuscules rendait 0. Reste, et c'est accepté : `q=villa R+1` sans espace final
rend aussi R+10 (préfixe du dernier mot), rare à Dakar.

**3. `derived_title`** — un titre alternatif écrit depuis les colonnes, **index seulement**
(décision produit du 2026-09-02 : ni exposé par l'API, ni affiché).

⚠ **Ce qu'il achète est le classement, pas l'ensemble rendu — mesuré par ablation.** Par
construction, il ne porte aucun jeton que `type_label`, `rooms_label`, `facts_label`,
`furnished_label`, `neighborhood` et `city` n'aient déjà. Son ablation laisse AC1 à AC5 verts. Ce
qu'il apporte, c'est que ces mots sont **dans un même champ, côte à côte** : la règle `proximity`
(avant `attribute`) classe « Appartement F4 à Mermoz » devant un bien dont la description frôle la
phrase. Un test de classement l'épingle, et il rougit sans le champ.

Une grammaire par famille de
type, chaque segment tombant s'il est absent, le lieu suivant la règle « quartier, ville » →
« ville » → rien :

| Famille | Gabarit | Exemple |
|---|---|---|
| habitation (`apartment`, `house`, `villa`, `studio`, `room`) | `{Type} {F(n)} {meublé·e} {R+n} à {quartier}, {ville}` — accord au féminin pour maison, villa, chambre | `Appartement F4 meublé à Médina, Dakar`, `Villa F5 meublée R+1 à Saly, Mbour` |
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
`local commercial` · `room` + `colocation` · `hotel` + `auberge lodge campement` · `farm` +
`verger`.

**Écartés par la mesure** (relevé dans le plan) : `office` + `plateau de bureaux` — « plateau »
seul rend 24 biens de 10 types, c'est le quartier ; `farm` + `champ` — 73 biens dont 0 ferme.

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

- [x] `app/Support/Search/PropertyLabels.php` — classe pure, trois méthodes statiques
      `rooms(Property): string`, `facts(Property): string`, `title(Property): string`, plus la
      table fermée `FAMILLES` (type → habitation / foncier / professionnel).
- [x] `Property::toSearchableArray()` : `+ 'rooms_label'`, `+ 'facts_label'`, `+ 'derived_title'`.
- [x] `Property::TYPE_SEARCH_ALIASES` : alias enrichis, **après** mesure de collision.
- [x] `config/scout.php`, index `properties` : `derived_title` après `title`, `rooms_label` et
      `facts_label` en fin de `searchableAttributes` ; commentaire portant la mesure de position.
- [x] `database/seeders/Support/SenegalFakerProvider.php` : gabarits `F{bedrooms}` → F(chambres + 1)
      ; `PropertyFactory` : `bedrooms`, `bathrooms`, `floor_number` à `null` pour les types non
      habitables.
- [x] `scripts/deploy.sh` : motif de réimport étendu à `app/Support/Search/` si nécessaire.
- [x] Tests unitaires `tests/Unit/PropertyLabelsTest.php` — en table, un cas par ligne des trois
      grilles ci-dessus, plus les cas nuls (`bedrooms = null`, sans adresse, sans ville).
- [x] Tests unitaires `tests/Unit/PropertySearchableArrayTest.php` — les trois champs présents,
      `test_tout_champ_de_vocabulaire_est_declare_searchable` étendu, la table `FAMILLES` couvre
      exactement `PropertyType`.
- [x] Tests moteur `tests/Feature/Search/PropertyDerivedVocabularyTest.php` (fichier neuf) — un scénario par
      requête du tableau de prémisse (`F4`, `T4`, `4 pieces`, `chambre salon`, `villa R+1`,
      `terrain TF`, `rdc`, `appart`), chacun **vérifié par ablation** du champ qui le sert.
- [x] Notes d'implémentation : relevé de collision par alias, position mesurée de
      `derived_title`, temps de réindexation (méthode de TCK-491 : hôte surchargé sur la ligne
      de commande, `SCOUT_QUEUE=false`, attente de `/tasks` à 0).

## Critères d'acceptation

- [x] **AC1** — `q=F4` en stratégie stricte rend **tous** les biens habitables publics à
      3 chambres, y compris un bien dont ni le titre ni la description ne contiennent « F4 » ;
      **et ne rend aucun** bien à 4 chambres. *(Le second membre est ce qu'une convention inversée
      cocherait.)*
- [x] **AC2** — `q=T4`, `q=3 chambres`, `q=3 chambres salon` rendent exactement le même ensemble
      que `q=F4`.
- [x] **AC3** — `q=chambre salon` rend le bien habitable à 1 chambre **en premier** et **aucun**
      studio ; `q=studio` continue de rendre les studios. *(« Chambre » tolère une faute au-delà de
      5 lettres : « chambres » matche aussi, le classement tranche, pas l'ensemble.)*
- [x] **AC4** — `q=villa R+1` rend les villas à `total_floors = 1` ; `q=terrain TF` rend les
      terrains à `title_type = titre_foncier` et aucun terrain en `bail`.
- [x] **AC5** — Un terrain à `bedrooms = 3` (fixture délibérée) n'est **pas** rendu par `q=F4`.
- [x] **AC6** — Retirer `rooms_label` de `toSearchableArray()` fait rougir AC2 et AC3 (AC1 tient
      encore par `derived_title`, qui porte « F4 » ; retirer les deux fait rougir AC1) ; retirer
      `facts_label` fait rougir AC4 ; retirer `derived_title` fait rougir le test de classement ;
      retirer le `dictionary` de l'index fait rougir AC4 : les cinq ablations sont jouées et
      consignées.
- [x] **AC7** — L'ordre de pertinence mesuré par TCK-335 est inchangé : le test
      `..._sans_reordonner_la_pertinence` reste vert avec les trois champs en place.
- [x] **AC8** — Ni `derived_title`, ni `rooms_label`, ni `facts_label` n'apparaissent dans une
      réponse de `GET /api/public/properties/search`, `show`, ni `GET /api/properties`.
- [x] **AC9** — Après `migrate:fresh --seed`, aucun bien de type `land`, `warehouse`, `office`,
      `shop`, `garage`, `parking`, `factory` ne porte de `bedrooms`, et tout titre seedé
      « F{n} » correspond à `bedrooms = n − 1`.
- [x] **AC10** — `./vendor/bin/pint --test` et `php artisan test` verts ; le temps de
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

Branche `feat/tck-506-vocabulaire-immobilier-derive`, backend seul, aucune migration. Le détail
des mesures est dans [le plan](../../plans/2026-09-02-tck-506-vocabulaire-immobilier-derive.md) ;
ce qui suit est ce qu'il faut savoir pour relire le diff.

⚠ **Toutes les durées de ce ticket sont prises sous charge** — deux suites Pest `--parallel`
d'autres projets tournaient (`load average` 200-330 sur 8 cœurs, mesuré par `uptime` et `ps`).
Aucune ne fait référence ; elles sont consignées avec leur charge parce qu'un chiffre sans sa
charge devient une croyance.

**Ce qui a changé par rapport au contrat écrit, et pourquoi.**

- **Pas de « {n+1} pieces », pas de compte sur `sdb`, pas de chiffre nu d'étage.** Première forme
  jouée : `F4 T4 4 pieces 3 chambres…` ; `q=4 pieces` rendait aussi le bien à 4 chambres
  (« 5 pieces 4 chambres »). Un document est un sac de mots : chaque chiffre nu qu'il porte répond à
  toute requête « N … ». Le contrat (§ `rooms_label`) est réécrit ; « 4 pièces » tombe sur le repli
  de TCK-338.
- **AC3 est un test de rang, pas d'ensemble** : « chambre » a 7 lettres, une faute est tolérée,
  « chambres » matche. Le bien à 1 chambre sort premier (`typo`, puis `exactness`).
- **Deux alias écartés par la mesure de collision** (`plateau de bureaux`, `champ`), relevé dans le
  plan. Le contrat est mis à jour.
- **`derived_title` n'élargit pas l'ensemble rendu, il fait rivaliser les colonnes avec le texte.**
  Son ablation laisse AC1 à AC5 verts — par construction, chacun de ses jetons est déjà ailleurs.
  Ce qu'il achète est mesuré avec `showRankingScoreDetails` : sur `q=appartement F4 Mermoz`,
  l'appartement qui EST à Mermoz passe devant « Appartement avec vue sur Mermoz » à Ouakam par
  `proximity` (0,857 contre 0,571) ; sans le champ, `attribute` classe le titre libre devant
  (0,703 contre 0,644). ⚠ `proximity` est sensible à l'ordre des mots ; le test épingle la forme
  où le champ décide. *La première version du test restait verte sous ablation : un test de
  classement qui ne rougit pas sous ablation ne mesure rien.*

**AC6 — les ablations, jouées le 2026-09-02** (une clé renommée dans `toSearchableArray()`) :
retirer `rooms_label` → AC2, AC3 rouges, **AC1 vert** (couvert par `derived_title`) ; retirer
`rooms_label` + `derived_title` → AC1 rouge ; retirer `facts_label` → AC4 rouge ; retirer
`derived_title` → le test de classement rouge, tout le reste vert.

**AC7 — position de `derived_title`** : deuxième, juste après `title`, et l'arbitre de TCK-335
reste vert. `rooms_label` et `facts_label` en dernier, après `furnished_label`, épinglé par
`PropertySearchableArrayTest`.

**Le seed et la factory.** `SenegalFakerProvider` écrivait `F{bedrooms}` — l'inverse de la
convention. Gabarits en `F{rooms}` / `{rooms} pièces` avec `rooms = bedrooms + 1`.
`PropertyFactory` et `PropertySeeder` ne posent plus `bedrooms`/`bathrooms` hors famille
habitation (la table `PropertyLabels::FAMILLES`), ni `floor_number` hors des types qui ont un
étage ; une valeur explicite prime, la fixture « terrain à 3 chambres » des tests reste
constructible (`PropertySeedConventionTest`).

**AC9 a attrapé un troisième seeder.** Après un premier `migrate:fresh --seed`, exactement 4 biens
de chaque type hors habitation portaient encore `bedrooms = 2`, `bathrooms = 1` et un étage :
`FilterCoverageSeeder`, qui crée un bien par `PropertyType` avec des défauts écrits sans regarder le
type. Corrigé de la même façon (famille habitation, `aUnEtage()`), re-seedé, re-vérifié — le relevé
est ci-dessous. *Un contrat qui nomme un seeder ne dit rien des autres : c'est la requête sur la
base qui les trouve.*

**AC10 — réindexation, 2026-09-02 21:03, `load average` 24 (sous charge) :**

```
MEILISEARCH_HOST=http://127.0.0.1:7701 MEILISEARCH_KEY=masterKey SCOUT_QUEUE=false \
  php artisan scout:flush "App\Models\Property" && php artisan scout:sync-index-settings \
  && php artisan scout:import "App\Models\Property"
→ 5,2 s d'horloge pour 836 lignes / 795 documents publiés, file de tâches vide 2 s plus tard ;
  `fieldDistribution` : derived_title 795, rooms_label 795, facts_label 795.
```

⚠ Ce premier relevé **précède le `dictionary`** (relevé par la revue : l'index local n'en avait
pas). Rejoué à 21:41 après l'ajout, même commande, `load average` 31 : **5,4 s**, file vide 2 s
plus tard, `GET /settings/dictionary` rend les 22 formes, 795 documents. *Une mesure sur un index
dont on n'a pas relu les réglages mesure l'index d'avant.*

**Ce que la revue adverse a trouvé, et ce qui en a été fait** (agent relecteur, même jour) :

- **Bloquant, réel : `q=villa R+1` était un test à pile ou face.** Le dernier mot d'une requête
  est complété par préfixe, chiffres compris : « 1 » matche « 150 m2 ». `area` n'était pas
  épinglée dans le corpus, la factory tire 30-500, et la villa basse tombait entre 100 et 199 une
  fois sur cinq — rouge sans qu'un fichier ait changé, la signature de D-44. Sur l'index local,
  `q=villa R+1` rendait 12 biens sur 22 pour cette raison. **Corrigé par le `dictionary`** (« R+n »
  = un jeton, mesuré ci-dessus), et toutes les surfaces du corpus sont épinglées — la villa basse à
  150 m² **exprès**, pour que le test garde le piège.
- **`R+n` était un chiffre nu**, en contradiction avec le contrat : `q=2 chambres` rendait 4 biens
  faux sur 31 sur l'index local (R+2 à 1, 3 ou 5 chambres). Même correctif ; `NIVEAUX_MAX = 10`
  borne l'émission à ce que le dictionnaire couvre, et `PropertySearchableArrayTest` épingle le
  couplage dictionnaire ↔ niveaux émis.
- **`bedrooms` n'a pas de cast** : une chaîne « 0 » venue d'un client HTTP donnait « 0 chambres
  salon » au lieu de « studio ». Normalisé en entier dans `PropertyLabels` ; test ajouté.
- Le gabarit « Villa contemporaine {rooms} pièces » réintroduisait dans le TITRE seedé le chiffre
  que l'index a chassé : remplacé par « {bedrooms} chambres ». `room` tire désormais **1** chambre
  dans les trois seeders/factory. Docblock « aucune dépendance au conteneur » corrigé (`trans()` en
  est une). Accord « meublée » pour maison, villa, chambre. Citation historique du provider
  restaurée.
- **Seconde passe** (après correctifs) : rien de bloquant, deux mineurs pris — au-delà de
  `NIVEAUX_MAX` on n'émet **rien** plutôt que « R+10 » pour 25 niveaux (un fait faux indexé), et
  l'index local a été resynchronisé avant la re-mesure AC10 ci-dessus. Le relecteur a re-mesuré
  le dictionnaire de son côté sur un index jetable : mêmes résultats.
- RAS confirmé par la revue : aucune fuite hors index (`grep` sur `app/` et `takussan-web/src/`,
  resources, `hydrate()`, `fields[properties]`), `deploy.sh` juste sous `set -euo pipefail`,
  aucun autre seeder ne pose de chambres hors habitation.

**Une régression attrapée par la suite entière, pas par les tests du ticket** :
`SearchWolofReviewSheetTest` (TCK-339) assertait « `warehouse:1` absent de TOUTE la feuille » pour
dire « Magasin n'atteint pas l'entrepôt ». Or « depot » est désormais un alias de `warehouse`, donc
le libellé front « Dépôt » atteint légitimement l'entrepôt ailleurs dans la feuille. L'assertion
est resserrée à la ligne de « Magasin » — le défaut qu'elle garde est intact, son périmètre était
trop large. *Un test qui asserte sur toute la sortie asserte aussi sur ce qu'il ne regarde pas.*

**AC10 — la suite entière**, jouée par la session principale, machine SOUS CHARGE (deux suites
Pest d'autres projets, `load average` 31-35 sur 8 cœurs au départ comme à l'arrivée) :

```
php artisan test          # 2026-09-02 21:21 → 21:46, arbre 02c323a0 MOINS le correctif de
                          #   SearchWolofReviewSheetTest, écrit après le départ de la suite
Tests: 1 failed, 2 skipped, 3106 passed (10256 assertions) — Duration: 1506 s
```

Le seul rouge est celui décrit ci-dessus, corrigé ensuite et vert seul (2 tests, 28 assertions).
Les deux correctifs postérieurs au départ (assertion resserrée, plafond `NIVEAUX_MAX`) sont
couverts par leurs classes rejouées vertes (61 tests unitaires, 2 tests de la feuille). **1506 s
n'est pas une référence** : la fourchette au repos est 470-610 s (cf. `CLAUDE.md`), le facteur
×2,5-3 mesure la charge, pas le dépôt.

Rejouée sur l'arbre final tel que poussé (`8d708770`, celui de la PR #253), charge en décrue
pendant l'exécution (`load average` 31,70 au départ, 2,84 à l'arrivée) :

```
php artisan test          # 2026-09-02 21:46 → 22:05
Tests: 2 skipped, 3107 passed (10257 assertions) — Duration: 1125 s
```

0 rouge. 1125 s reste hors de la fourchette au repos pour la même raison : la charge des trois
premiers quarts d'heure.

**`scripts/deploy.sh`** — la boucle de réimport ne regardait que `app/Models/*.php` portant
`toSearchableArray` et `config/scout.php` ; un diff de `app/Support/Search/*.php` seul aurait
laissé tous les documents avec leur ancien vocabulaire, sans rouge. Il déclenche désormais l'import
de `Property`.

**Piège payé : le `.env` local vise Meilisearch 7700** (l'instance brew, D-48) quand la suite vise
7701 ; toute commande `scout:*` jouée à la main doit passer `MEILISEARCH_HOST` explicitement.

