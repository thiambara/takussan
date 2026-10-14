# ADR-0062 — Une adresse se choisit dans un référentiel Région → Ville → Quartier tenu en base, qui accepte un quartier inconnu en attente de validation

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Tickets** : [TCK-633](../backlog/tickets/TCK-633-lot-retours-porteur-publication-recherche-boost.md)

## Contexte

Relu sur `dev` le 2026-10-11 :

- **Le formulaire de création n'a que du texte libre** : ville (obligatoire), quartier, région, rue,
  code postal, pays (`StepLieu`). L'API n'y applique ni liste ni longueur (`StorePropertyRequest`,
  `nullable|string`).
- **Aucun référentiel géographique n'existe** — ni table, ni fichier, ni configuration. On trouve
  seulement des listes codées en dur et sans rapport entre elles : 20 quartiers de Dakar dans
  `SenegalFakerProvider`, 9 dans `AddressFactory`, 6 villes dans deux composants du front, dont l'un
  avoue que « the codebase doesn't ship [a cities catalog] yet ».
- **La recherche compare par égalité stricte** (`city = '…'`, `neighborhood = '…'`,
  `PropertySearchService`) des valeurs saisies librement : « Liberté 4 », « Liberte 4 » et
  « liberté IV » sont trois quartiers, et une faute de frappe rend 0 résultat. Les listes de villes
  et de quartiers servies au public sont *déduites* des adresses saisies
  (`PublicPropertyController::cities`), donc héritent de ces variantes.

Le **2026-10-11**, le porteur a demandé que l'annonceur choisisse la région, puis la ville, puis le
quartier, dans des listes avec recherche, et que la position exacte s'affiche en latitude /
longitude et puisse se donner par « tout ce qui peut représenter une position ». Il a validé le
2026-10-12 qu'un quartier absent soit accepté, puis validé par le super-admin (D8).

## Décision

**Le référentiel vit en base, en trois tables hiérarchiques, rempli par un jeu de données versionné
dans le dépôt. Une adresse y pointe et garde ses colonnes texte, qui portent les noms canoniques.
Un quartier inconnu entre en attente : il sert tout de suite l'annonce qui l'a proposé, et n'est
proposé aux autres qu'après validation.**

### 1. Trois tables

- **`geo_regions`** — les 14 régions.
- **`geo_cities`** — région, nom, slug, latitude / longitude du centre.
- **`geo_neighborhoods`** — ville, nom, slug, latitude / longitude du centre, statut
  `approved | pending | rejected`, origine (`dataset | user`), auteur de la proposition, et
  `merged_into_id` quand il a été fusionné dans un autre.
- **Unicité** sur le parent et le nom replié **par l'expression d'ADR-0025**
  (`LOWER(name COLLATE "und-x-icu")`), et non `lower()` nu — sinon « LIBERTÉ » passe à côté de
  « Liberté ». Les accents ne sont pas repliés (ADR-0020 §2) : « Liberte 4 » se résout par la
  recherche de la liste, pas par l'index.

### 2. Ce que « Ville » veut dire

Le référentiel suit **l'usage des annonces, pas le découpage administratif**. Dans l'agglomération
dakaroise (départements de Dakar, Pikine, Guédiawaye, Keur Massar), la ville est le département et
les quartiers sont ceux que les annonces nomment (Almadies, Mermoz, Sacré-Cœur 3, Liberté 4…),
communes d'arrondissement comprises. Ailleurs, la ville est la commune. Ce choix est relu par le
porteur sur le jeu de données avant fusion.

### 3. La source

- Régions et communes : le découpage administratif en vigueur (Acte III de la décentralisation).
- Quartiers et centres : extraits d'OpenStreetMap (`place=suburb|quarter|neighbourhood`), puis
  relus à la main.
- Le jeu de données est un **fichier versionné** du dépôt, chargé par un seeder idempotent (mise à
  jour par slug, jamais de suppression d'un lieu référencé par une adresse). Le script d'extraction
  est conservé à côté, pour qu'une mise à jour se rejoue au lieu de se refaire.
- **Les données OpenStreetMap sont sous licence ODbL** : la mention « © les contributeurs
  d'OpenStreetMap » est due là où le référentiel est servi. Elle s'ajoute aux pages légales.

### 4. L'adresse pointe et garde son texte

- `addresses` reçoit `geo_city_id` et `geo_neighborhood_id`, nullables, indexés, `nullOnDelete`.
- Les colonnes `region`, `city` et `neighborhood` **restent**, et reçoivent les noms canoniques du
  référentiel. L'index de recherche, les filtres et les pages par ville et par quartier n'ont donc
  rien à changer, et les valeurs qu'ils comparent deviennent enfin stables.
- Les adresses existantes sont rattachées quand leur ville et leur quartier se retrouvent par le nom
  replié ; les autres gardent leur texte, sans identifiant.
- Le pays est le Sénégal (`SN`), seul servi.
- **Renommer ou fusionner** un quartier réécrit le texte des adresses qui y pointent et réindexe
  leurs biens, dans la même opération.

### 5. Un quartier inconnu

- L'annonceur qui ne trouve pas son quartier le saisit : un `geo_neighborhoods` `pending` naît,
  rattaché à la ville choisie, et sert aussitôt son adresse.
- Les listes publiques ne servent que les quartiers `approved` ; l'annonceur voit en plus les siens
  en attente.
- Le super-admin valide, renomme, fusionne dans un quartier existant ou rejette. Un rejet n'efface
  pas l'adresse : elle garde son texte et perd son identifiant.
- Une saisie qui se replie sur un quartier existant de la même ville est **ce quartier**, pas une
  proposition.

### 6. La position exacte

- Latitude et longitude s'affichent et se corrigent à la main ; choisir un quartier centre la carte
  sur lui.
- Un champ « collez un lien ou une position » reconnaît, **dans le navigateur** : les liens Google
  Maps longs (`@lat,lng`, `?q=`, `ll=`, `!3d…!4d…`), une position partagée par WhatsApp (qui est un
  tel lien), des coordonnées décimales ou en degrés-minutes-secondes, et un Plus Code — complet, ou
  court rapporté au centre de la ville choisie. S'y ajoutent (TCK-633, après vérification) les
  degrés décimaux à la façon de Plans d'Apple (« 14,7167° N, 17,4677° O ») et les liens
  OpenStreetMap (`mlat`/`mlon`, `#map=z/lat/lon`) et Plans d'Apple (`ll=`, `coordinate=`) — lus
  sans réseau ; aucun de ces hôtes n'est suivi par l'API.
- **Un lien court** (`maps.app.goo.gl`, `goo.gl/maps`) ne se résout qu'en suivant sa redirection, ce
  que le navigateur ne peut pas faire (CORS). L'API le résout : utilisateur authentifié, débit
  limité, **https seulement, hôtes Google Maps seulement à chaque saut**, trois sauts au plus,
  lecture de l'en-tête `Location` sans télécharger de corps, délai court. Un hôte hors liste est
  refusé avant toute requête : c'est la garde contre une SSRF.
- Une position hors du Sénégal est signalée avant l'enregistrement, pas refusée.

### 7. Les équipements suivent la même règle

Ajouté le 2026-10-12, pendant l'implémentation : les équipements d'un bien sont un référentiel au
même titre que les quartiers, et le porteur a tranché la même règle (D9) — un équipement absent est
rattaché tout de suite et n'est proposé aux autres qu'après validation.

- **Un seul type, `amenity`.** L'ancien type `feature` y est fondu ; les étiquettes CRM
  (`customer`, …) restent à part et ne se fusionnent jamais avec un équipement.
- **Un catalogue versionné** dans le dépôt, chargé à chaque déploiement par
  `tags:sync-catalog` (`docker/release.sh` ; la production ne lance aucun seeder). Ses entrées sont
  `approved`, et le front les traduit par slug (fr/en/wo).
- **Un nom tapé** qui ne se replie sur aucun équipement visible devient une proposition `pending`,
  rattachée au bien et affichée telle quelle, sans traduction. Statuts, validation, renommage,
  fusion et rejet suivent le §5.
- **Une proposition en attente ne sort que là où son auteur l'a rattachée** : la liaison porte
  `taggables.attached_by_id`. Un tiers qui tape le même nom, ou qui duplique le bien, obtient la
  liaison sans qu'elle s'affiche ni se cherche sur sa fiche publique ; l'identifiant d'une
  proposition d'autrui est refusé.
- **Ce qui s'affiche est ce qui se cherche** : l'index de recherche et les filtres de la liste et de
  la carte ne lisent que les équipements visibles sur la fiche. Toute écriture qui change cette
  visibilité (rattachement, retrait, validation, renommage, fusion, rejet) réindexe les biens
  concernés.

### 8. Deux villes du même nom

Ajouté le 2026-10-12 (TCK-635) : le référentiel compte trois paires de communes homonymes, chacune
dans deux régions — Dinguiraye (Diourbel, Kolda), Missirah (Diourbel, Tambacounda), Vélingara
(Matam, Kolda). Le nom seul ne désigne donc pas une ville, et le filtre « Ville » de la recherche
proposait le même nom deux fois pour deux lieux qu'il ne savait pas distinguer.

- **La ville se départage par sa région, pas par son identifiant.** La recherche compare le texte
  des adresses (§4) ; un filtre par `geo_city_id` exclurait toute adresse non rattachée. La liste
  et la carte acceptent donc un paramètre `region` (nom canonique), comparé à `addresses.region`
  comme `city` l'est à `addresses.city`. L'index de recherche porte `region`, filtrable.
- **Le couple (nom de ville, région) est unique** dans le référentiel ; un test du jeu de données le
  garde. C'est ce qui rend l'identification sans ambiguïté.
- **L'interface n'écrit `region` que pour une ville homonyme**, et l'affiche alors à côté du nom
  (« Dinguiraye (Kolda) ») ; ailleurs, l'URL reste `city=Thiès`. `region` n'a pas de puce propre :
  elle appartient à celle de la ville, et se retire avec elle.
- La liste des quartiers d'une ville homonyme se cherche par le couple (ville, région).

## Conséquences

- **Un jeu de données à tenir.** Il sera incomplet au départ ; la proposition de quartiers et la
  validation super-admin sont faites pour le compléter par l'usage.
- **Une obligation de mention ODbL** sur les pages légales.
- **Le formulaire de recherche** (ville, quartier) se branche sur les mêmes listes : une faute de
  frappe ne peut plus produire un filtre à 0 résultat.
- **Le texte des adresses reste la vérité de la recherche** : un rattachement manqué n'empêche pas
  une annonce d'être trouvée, il l'empêche seulement de profiter des renommages.
- **Une route sortante de plus** dans l'API (la résolution de liens courts), bornée par une liste
  d'hôtes.

## Application

À écrire par TCK-633 au moment de l'implémentation : le seeder et son test d'idempotence, le test
de l'unicité repliée (« LIBERTÉ 4 » contre « Liberté 4 »), le test de la proposition puis de la
fusion (texte des adresses réécrit, biens réindexés), le test de la liste d'hôtes du résolveur
(hôte refusé avant toute requête, saut vers un hôte hors liste refusé), les tests du parseur de
positions côté front, et la mise à jour de `docs/models-spec.md` pour les trois tables et les deux
colonnes d'`addresses`.
