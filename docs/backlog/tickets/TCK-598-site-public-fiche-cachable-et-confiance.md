---
id: TCK-598
title: "Site public : la fiche publique divulgue la part de commission des collaborateurs et ne peut pas être mise en cache ; le coût d'entrée, la confiance, le bien loué, les quartiers et l'installation manquent"
status: todo
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#8-propertycollaborator
tags: [back, front, public, securite, cache, seo, pwa, adr-requise]
---

## Objectif utilisateur

- **Visiteur** : sur la fiche d'un bien, il voit ce qu'il devra payer pour emménager, à qui il
  parle et si ce contact est vérifié. Un lien vers un bien déjà loué ne le laisse pas sans issue.
  Il trouve par un moteur de recherche les biens de son quartier, et il peut installer le site
  et relire ses favoris avec une connexion intermittente.
- **Agent / collaborateur d'un bien** : sa part de commission et son rôle ne sont lisibles par
  personne en dehors de son agence.

## Contexte

Analyse par acteur du 2026-10-06, vague 73 : points V8, V9, V10, V14, V15, V16, V17, V18 et V19
du rapport « visiteur », point B1 du rapport « courtier ». Les constats ont été re-mesurés sur
`e3ab4a4e`. Les chemins sont relatifs à `takussan-api/` ou à `takussan-web/`.

### 1. La fiche publique divulgue la part de commission de chaque collaborateur (B1, sécurité)

- `PropertyResource.php:161-182` sérialise `collaborators[]` (`id`, `user_id`, `role`,
  `commission_share`, `user.id`, `user.name`) **dès que la relation est chargée**. Seul l'e-mail
  est masqué pour un anonyme (l.175-178).
- `PublicPropertyController::show()` charge `collaborators.user.media` (l.504), et `compare()`
  aussi (l.319). `GET /api/public/properties/{slug}` et `GET /api/public/properties/compare`
  rendent donc, à un anonyme, la part de commission et le rôle de chaque collaborateur agent.
- Le chargement n'est pas fautif. `PrimaryPropertyContact::eagerLoads()`
  (`Services/Property/PrimaryPropertyContact.php:72-75`) l'exige pour `primary_contact`.
  **Retirer l'eager-load déplacerait le défaut vers un N+1 sans le fermer.** C'est la sérialisation
  qu'il faut conditionner.
- Aucun test public ne l'interdit : `commission_share` n'apparaît que dans
  `tests/Feature/Api/PropertyCollaboratorTest.php`. Côté front, seul le tableau de bord lit
  `collaborators`, via une route authentifiée (`(dashboard)/app/properties/(liste)/page.tsx:226`,
  `lib/queries/properties-server.ts:120`).

### 2. La fiche ne peut pas être mise en cache, et son compteur de vues est faux (V17)

- `show()` incrémente `views_count` à chaque lecture (l.514-518, clé `views:{id}:{ip}`, 3 par
  heure). Le compteur est affiché, et il le reste (`PropertyHeader.tsx:42-45`).
- **`$property->increment()` n'est pas une écriture neutre.** Dans
  `Eloquent/Model.php:1117-1144` et `Eloquent/Builder.php:1347-1351` (Laravel 13, lu dans
  `vendor/`), il déclenche `updating` et `updated`, et il écrit `updated_at`. Chaque vue fait donc
  deux choses :
  - elle exécute `PropertyObserver::updated` (`Observers/PropertyObserver.php:36-49`), donc
    `SimilarPropertiesService::invalidateForProperty()` ;
  - elle rajeunit `updated_at`, que le sitemap publie comme `lastModified`
    (`lib/queries/sitemap-catalogue.ts:28`).

  Une invalidation de cache branchée sur « le bien a été modifié » serait donc déclenchée par
  chaque vue.
- **Le compteur ne compte pas les visiteurs.** `getProperty()` (`lib/queries/public-property.ts:59-79`)
  passe par `apiFetch`, qui n'envoie ni `X-Forwarded-For` ni `Authorization` (`lib/api.ts:45-76`).
  Seul `apiRequest` transmet l'IP (l.517). L'API voit donc l'IP du serveur Next pour tout
  visiteur, et la clé `views:{id}:{ip}` est commune à tous : le compteur monte d'au plus 3 par
  heure et par bien. *Inféré de la lecture, pas mesuré en charge.*
- La page `/bookings` relit la fiche (`[locale]/(public)/bookings/page.tsx:81-86`), sans
  `encodeURIComponent`, et compte ainsi une seconde vue.
- **Le corps de la fiche dépend de l'appelant**, ce qui est le premier des trois refus de TCK-341
  (`routes/api/public.php:86-105`, `tests/Feature/Public/CataloguePublicCacheTest.php`). Avec un
  jeton Bearer, `ResolveActiveProfile` pose l'utilisateur, et la réponse change de trois façons :
  - les quatre champs de modération apparaissent (`PropertyResource.php:202-217`) ;
  - l'e-mail des collaborateurs apparaît (l.178) ;
  - `photos[].original` devient une URL signée pour qui détient `viewRaw` (l.393, l.411).
- **Une mise en cache du HTML de la page entière est impossible en l'état.** La mise en page
  racine lit le cookie d'authentification et appelle `getMe` (`src/app/layout.tsx:66-76`), ce
  qui rend toute route dynamique. Hors `sitemap.ts:48`, aucune page ne déclare `revalidate`.
  Ce qui est atteignable ici, c'est le cache des **données** de la fiche côté serveur Next.

### 3. Le coût d'entrée d'une location n'existe nulle part sur le bien (V9)

- `Property::$fillable` (`Models/Property.php:41-51`) n'a ni caution, ni avance, ni frais
  d'agence, ni charges. Ces notions n'existent que sur le bail (`Lease.php:32-33`,
  `deposit_amount` et `commission_amount`). Le § 3 Property de `models-spec.md` ne les décrit pas
  non plus : **elles ne sont pas spécifiées** (ligne à ajouter, voir les notes de rédaction).

### 4. Aucun signal de confiance sur la personne à contacter (V8)

- `buildUserLite()` (`PropertyResource.php:314-325`) rend `id`, `name`, `slug`, `avatar_url`,
  `is_agent` et `member_since`. Il ne dit rien du téléphone vérifié, alors que
  `users.phone_verified_at` existe (`User.php:56,88`).
- **Il n'existe pas de statut « identité vérifiée » pour une personne.** Le rapport le déduisait
  de `KycDossier`, mais un dossier KYC n'est rattaché qu'à une **agence** : `Agency::kycDossier()`
  (`Agency.php:162-164`) est la seule relation, et `KycWorkflowService::verify()` ne met à jour
  que `agencies.is_verified` (l.101-118). La vérification de l'agence est déjà émise
  (`PropertyResource.php:349`) et affichée (`PropertyAgentCard.tsx:98-99`).
- Aucun conseil de prudence n'est affiché. Dans `messages/fr.json`, « Arnaque » n'apparaît que
  comme motif de signalement (l.763).

### 5. Un bien loué, vendu ou retiré mène à une impasse (V10)

- `scopePublic()` (`Property.php:458-473`) exclut `sold`, `rented`, `archived`,
  `under_maintenance` et `unavailable`. La fiche rend alors `not-found.tsx` (l.1-27), qui ne
  propose que deux liens génériques. Or le lien d'un bien loué continue de circuler sur WhatsApp.
- `/similar` exige lui aussi `public()` (`PublicPropertyController.php:523-533`). La page d'un
  bien retiré ne peut donc pas s'en servir telle quelle.

### 6. Aucune page de quartier n'est indexable (V14)

- `CLES_CANONIQUES = ['contract_type', 'type', 'city']` (`lib/canonique.ts:261`) : la clé
  `location`, c'est-à-dire le quartier, se replie sur la page nue.
- Le sitemap (`app/sitemap.ts:69-108`) ne contient que les pages statiques
  (`lib/sitemap.ts:54-62`), les fiches et les profils. Aucune page de ville n'y figure, alors que
  ces pages sont déjà canoniques d'elles-mêmes.
- Le modèle existe pour la ville : `cities()` (`PublicPropertyController.php:185-215`) avec son
  plafond et `truncated`. La recherche filtre déjà le quartier par égalité
  (`PropertySearchService.php:372-373`).

### 7. Les portefeuilles des pages agent et agence suivent un autre prédicat (V15)

Le prédicat `status=available` + `visibility=public`, écrit à la main sans `is_test` ni
`published_at`, apparaît **six fois** et non quatre :

- `PublicAgentController.php:213-216` (`show`) et `:378-381` (`properties`) ;
- `PublicAgencyController.php:217-220` (`show`), `:255-258` (publieurs de l'équipe), `:270-274`
  (comptes par membre) et `:383-386` (`properties`).

Les deux index (`PublicAgentController.php:114-118`, `PublicAgencyController.php:125-131`)
passent déjà par `publicPortfolio()` (`Property.php:509-512`). Un bien de test, ou jamais
publié, peut donc figurer sur une page agent et mener à une fiche en 404.

### 8. `per_page` sans plafond sur deux routes anonymes (V16)

- `index()` fait `paginate((int) $request->input('per_page', 20))` (l.117), et son propre voisin
  le décrit comme « une invitation à demander le catalogue entier » (l.135-139).
- `reviews()` fait de même (l.547).
- Les précédents bornent : `sitemap()` (l.148-149), `PublicAgentController::properties()` (l.376)
  et `IndexPublicProfilesRequest::tailleDePage()` (`PER_PAGE_MAX = 48`).

### 9. Pas d'application installable ; un commentaire affirme le contraire (V18)

- `find takussan-web/src -name 'manifest*'` ne trouve rien, alors que `src/i18n/routing.ts:98-99`
  affirme que « `manifest.ts` sert `/manifest.webmanifest` (200) ». Aucun service worker n'existe.
- `public/` ne contient que les cinq SVG du gabarit create-next-app (`file.svg`, `globe.svg`,
  `next.svg`, `vercel.svg`, `window.svg`), qu'aucun fichier de `src/` ne référence.
- Les favoris d'un visiteur sont des identifiants en `localStorage` (`lib/favoritesStore.ts:31-40`).

### 10. Visite virtuelle ou vidéo : émise, jamais remplie, jamais affichée (V19)

- `media_extra.virtual_tour_url` est lu dans `metadata` (`PropertyResource.php:138`), mais
  `StorePropertyRequest` n'accepte pas `metadata` (règles l.40-73).
- La collection `videos` (`Property.php:591-593`) ne peut être remplie par aucune route :
  `MediaUploadRequest::COLLECTIONS` contient `photos`, `documents`, `avatars` et `logo` (l.12).
- Aucun composant ne lit `media_extra` (seul `types/property.ts:180` le déclare).
- `models-spec.md:26` annonce une collection `virtual_tours` que le code n'a pas.

## Contrat de données

**Endpoints nouveaux** (groupe `public`, `throttle:public-read` sauf mention contraire) :

- `POST /api/public/properties/{slug}/view` → `204`, nom `public.properties.view`, limiteur
  nommé `public-view`. Compte une vue. Ne rend jamais d'erreur visible : un slug inconnu rend
  aussi `204`.
- `GET /api/public/properties/{slug}/status` → `{ data: { state, contract_type, type, location:
  { city, quarter }, similar: PropertyResource[] } }`. `state` vaut `available`, `rented`, `sold`
  ou `withdrawn` : ce sont des codes, et le front les traduit.
- `GET /api/public/properties/neighborhoods?city=<ville>` → `{ data: [{ value, count }], meta:
  { truncated } }`, sur le modèle de `cities()`.

Les segments littéraux (`neighborhoods`) se déclarent **au-dessus** de `properties/{slug}`
(`routes/api/public.php:50-58`).

**Champs nouveaux de `PropertyResource`** (forme détail, donc fiche, comparateur et
`properties.show`) :

- `entry_cost: { deposit_months, advance_months, agency_fee_months, monthly_charges, total } | null`.
  `total` est calculé côté API, dans la devise du bien. Il vaut `null` hors location mensuelle.
- `virtual_tour_url: string | null`, au premier niveau. `media_extra.virtual_tour_url` le
  reprend pour la compatibilité, puis disparaît une fois le front migré.
- `primary_contact.phone_verified` et `owner.phone_verified` : des booléens, jamais la date ni
  le numéro.

**Retrait** : sur toute route `public.*`, la clé `collaborators` est **absente** (et non `null`).

**Colonnes** (`properties`, une migration nommée, datée du jour de l'implémentation, par exemple
`add_entry_cost_and_virtual_tour_to_properties_table`) :

- `deposit_months`, `advance_months` : `unsignedSmallInteger`, nullable ;
- `agency_fee_months` : `decimal(4,2)`, nullable ;
- `monthly_charges` : `decimal(14,2)`, nullable ;
- `virtual_tour_url` : `string(2048)`, nullable.

Aucun `enum()` (ADR-0007), aucun index (comme TCK-508 : on indexe sur mesure). La spec ne les
décrit pas : la session ajoute les lignes au § 3 Property **avant la fusion**.

## Direction UX / Artistique

Direction « Ancrage Local Contemporain » (`docs/design-guidelines.md`). Mobile d'abord, 3G.

- **Coût d'entrée** : un bloc sobre sous le prix, avec une ligne par poste et un total mis en
  évidence (« Total à l'entrée »). Chiffres tabulaires, formatés selon la langue. Il est absent,
  et non à zéro, quand rien n'est renseigné. Le comparateur l'affiche en ligne de critère.
- **Confiance** : un badge discret « Téléphone vérifié » dans l'identité du contact, à côté du
  badge d'agence vérifiée existant. Un encadré de prudence court, en fr, en et wo (« Ne versez
  jamais d'argent avant d'avoir visité le bien »), visible près des contacts sans les écraser :
  il informe, il n'effraie pas.
- **Bien retiré** : un message clair (« Ce bien a été loué »), puis immédiatement des biens
  similaires et une recherche du même quartier. Ce n'est pas une page d'erreur.
- **Pages de quartier** : le même gabarit de liste, avec un titre traduit qui nomme le type, le
  contrat, le quartier et la ville.
- **Visite virtuelle ou vidéo** : une vignette identifiable dans la galerie, chargée seulement
  au geste de l'utilisateur, jamais à l'ouverture de la fiche.
- **Installation** : nom, icônes et couleurs de la charte. Hors ligne, une page qui dit
  l'absence de connexion et montre les favoris déjà vus, sans faux contenu.

## Contraintes strictes (métier)

1. **Les collaborateurs ne sortent jamais sur une route `public.*`**, quel que soit l'appelant,
   jeton Bearer compris. Les routes authentifiées (`properties.index`, `properties.show`)
   gardent leur comportement : qui peut y lire `commission_share` relève de TCK-587.
2. **Le corps de `public.properties.show` ne dépend pas de l'appelant.** Avec le jeton du
   propriétaire du bien, la réponse est identique à la réponse anonyme. Sur les routes
   `public.*`, cela couvre les champs de modération, `photos[].original` et `?raw=1`.
3. **Le compteur de vues n'est pas une modification du bien.** Il s'incrémente par le
   constructeur de requêtes, sans `updated_at` et sans événement de modèle. Aucune lecture
   (`GET`) n'écrit plus en base.
4. **Le compteur affiché peut avoir le retard du cache de la fiche** (décision du porteur du
   2026-10-06). C'est accepté et cela doit être écrit dans les notes d'implémentation, avec la
   durée de revalidation retenue.
5. **L'appel en cache de la fiche ne porte aucun en-tête propre au visiteur** (ni IP ni jeton).
   Sinon, la clé de cache se fragmente par visiteur et le cache ne sert à rien. Inversement, le
   comptage doit voir l'IP **du visiteur** : s'il transite par le serveur Next, celui-ci
   transmet `X-Forwarded-For`.
6. **Invalidation** : la publication, la dépublication, et la modification d'un champ servi par
   la fiche (titre, prix, statut, visibilité, description, coût d'entrée, visite virtuelle,
   adresse) invalident les données en cache de la fiche. **Si le slug change, l'ancien aussi est
   invalidé.** Une vue n'invalide rien. L'observateur de cache est une **classe distincte** de
   `PropertyObserver`, qui appartient à TCK-599. Il s'enregistre à côté de lui
   (`AppServiceProvider.php:375`).
7. **ADR requis avant le code** (premier élément du Delta). Les nouvelles clés d'environnement
   (URL et secret d'invalidation) entrent dans `.env.example` **et** `.env.docker` (garde
   `check-env-parity.mjs`), et dans l'environnement du front.
8. **Coût d'entrée** : il ne s'applique qu'à `contract_type=rent` avec `rent_period=monthly`.
   Sinon, l'API refuse les champs (422) et émet `entry_cost: null`. Bornes : mois de 0 à 24,
   montants ≥ 0. Formule : `total = (price + monthly_charges) × advance_months + price ×
   deposit_months + price × agency_fee_months`. Le total s'arrondit à l'unité, sans décimale en
   franc CFA (principe n°3). Les colonnes vides comptent pour 0, mais `entry_cost` vaut `null` si
   les quatre sont vides. La duplication d'un bien (`PropertyDuplicateRequest`) les copie.
9. **Confiance** : seuls des booléens dérivés sortent. Aucune date, aucun numéro, aucun champ
   KYC. Aucun « identité vérifiée » de personne n'est inventé, puisque le modèle de données n'en
   porte pas (§ 4).
10. **Page de bien retiré, côté API** : `status` répond 404, **indiscernable d'un slug inconnu**,
    pour un brouillon, un bien en attente de modération ou refusé, privé, de test, jamais publié
    (`published_at` nul) ou supprimé. L'existence d'un bien non public et la mécanique de
    modération ne fuient pas (TCK-335). Le prédicat d'éligibilité **compose** les critères non
    statutaires de `scopePublic()` au lieu de les recopier. Si TCK-600 a ajouté le filtre
    « agence active » à `scopePublic()`, le bien d'une agence suspendue répond 404 ici aussi.
11. **Page de bien retiré, côté front** : elle n'est jamais indexable (`noindex`), n'émet pas de
    JSON-LD `RealEstateListing`, et ne dit jamais « introuvable » d'un bien qui existe. Le code
    HTTP (404, 410, ou 200 avec `noindex`) se choisit sur ce que Next 16 permet, et se mesure.
12. **Quartiers** : le domaine est borné par ville et plafonné, avec `truncated`. Il replie les
    variantes de casse par `CaseInsensitive` (piège n°9 du `CLAUDE.md`). Un quartier n'est
    canonique d'une page **que** s'il appartient au domaine de la ville présente dans l'URL et
    s'il compte au moins N biens, N étant écrit dans le code. Seuls les couples retenus entrent au
    sitemap. Une valeur hors domaine se replie sur la page nue, comme `city` aujourd'hui.
13. **Visite virtuelle** : seulement une URL `https`, dont l'hôte appartient à une liste
    d'autorisation déclarée côté API (configuration, pas front). Il n'y a pas de CSP
    (`next.config.ts:183-190`) : la liste d'autorisation est la seule barrière contre
    l'intégration d'une page arbitraire. **Aucun prix indicatif en devise étrangère** (décision du
    porteur).
14. **Service worker** : il ne met **jamais** en cache une navigation HTML. La mise en page
    racine y injecte l'utilisateur connecté (`layout.tsx:66-91`), et ce cache resservirait ses
    données après la déconnexion. Il ne met jamais en cache une réponse authentifiée, ni
    `/app`, `/admin`, `/super-admin` ou un handler BFF `/api/*` autre que les lectures publiques
    anonymes. Seuls entrent les ressources statiques versionnées, une page hors ligne, et les
    réponses anonymes nécessaires à la relecture des favoris locaux. Un nouveau déploiement
    remplace l'ancien cache.
15. **Coordination avec la vague 73** (conflits de lignes voisines uniquement, jamais de
    réécriture concurrente) :
    - **TCK-586** : `PropertyResource::actsAsAgent` (l.272-285) jouxte `buildUserLite`, et
      `PublicAgencyController.php:293` (sous-requête courtier) jouxte les l.255-274. 598 n'y
      touche pas.
    - **TCK-590** : il possède `PropertyAgentCard`, `WhatsAppButton` et les contacts de
      `PublicPropertyController`. 598 ajoute le badge et l'encadré **sans** réécrire les boutons ;
      si possible, l'encadré vit hors de la carte. 590 ajoute `has_phone` dans
      `buildPrimaryContact()`, et 598 ajoute `phone_verified` dans `buildUserLite()` : ce sont des
      lignes voisines, et les deux booléens sont indépendants de l'appelant (contrainte 2).
    - **TCK-595** : il possède le calcul par lot de `PropertyResource`, ce qui exclut les blocs
      `collaborators` et `buildUserLite` ainsi que les nouveaux champs.
    - **TCK-599** : il possède `PropertyObserver`, la liste des favoris et
      `lib/queries/favorites.ts`. Le service worker n'en modifie aucun.
    - **TCK-600** : il possède `scopePublic()`. Voir la contrainte 10.
    - **TCK-587** : il possède l'autorisation de `PropertyController`. 598 n'ajoute que des
      règles de validation aux FormRequests de création et de modification.
    - **TCK-585** (en `review`) : il touche les URL de photos de `PropertyResource`. La
      contrainte 2 doit conserver son repli WebP.

## Delta à produire

### 0. Décision

- [ ] **ADR à écrire et accepter avant le code** : « Cache public de la fiche et du visiteur ».
      Il tranche trois questions :
      - comment l'API invalide les données en cache du front (appel signé de l'API vers un
        handler de revalidation du front, plus une revalidation temporelle de plancher) ;
      - ce que devient l'invalidation tant que `master` est servie par Vercel et `preview` par le
        VPS, et avec plus d'une réplique du front (un cache par instance) ;
      - ce que le service worker a le droit de mettre en cache (contrainte 14).

      Option recommandée : un cache de données par étiquette `property:{slug}` avec une
      revalidation de 300 s, plus l'appel signé. L'ISR du HTML reste hors périmètre (question au
      porteur).

### 1. Fuite des collaborateurs (B1)

- [ ] `PropertyResource` : émettre `collaborators` seulement si la route n'est pas `public.*`.
      Garder l'eager-load de `show`/`compare` (requis par `PrimaryPropertyContact`).
- [ ] Test `tests/Feature/Public/PropertyCollaboratorsNotExposedTest.php` : `show` et `compare`,
      en anonyme puis avec le jeton d'un utilisateur quelconque, sur un bien qui a un
      collaborateur agent avec `commission_share = 30`.

### 2. Fiche cachable et compteur juste (V17)

- [ ] `PublicPropertyController::show()` : retirer l'incrément.
- [ ] `PublicPropertyController::view()` + route `public.properties.view` + limiteur
      `public-view` (`AppServiceProvider`) : déduplication par (bien, IP) sur une heure, puis
      incrément par le constructeur de requêtes, sans timestamps ni événements.
- [ ] `PropertyResource` : sur les routes `public.*`, rendre le corps indépendant de
      l'appelant (contrainte 2).
- [ ] `App\Observers\PropertyPublicCacheObserver` (enregistré dans `AppServiceProvider`) + job
      `App\Jobs\RevalidatePublicPropertyPage` (appel signé, nouvel essai si échec, sans effet
      quand la configuration est absente). Champs déclencheurs : contrainte 6.
- [ ] Front : la fiche lit ses données par un appel mis en cache, étiqueté par slug et
      invalidable. Un handler protégé par secret reçoit l'invalidation. La vue est comptée par un
      appel séparé, sans bloquer la page et sans le refaire au rafraîchissement d'un composant.
- [ ] Front `/bookings` : encoder le slug, et ne plus compter de vue (automatique une fois
      l'incrément retiré de `show`).
- [ ] Réécrire les assertions qui affirment l'incrément dans `show` : `CataloguePublicCacheTest`
      (l.133-145), et `PropertyResourceSparseFieldsTest` si son l.221 en dépend. Garder leur
      partie « variante authentifiée ».
- [ ] Commentaire de route `routes/api/public.php:86-105` : le mettre à jour, puisque ses trois
      refus ne tiennent plus.

### 3. Coût d'entrée (V9)

- [ ] La migration ci-dessus. `Property::$fillable` et `$casts`.
- [ ] Règles dans `StorePropertyRequest` et `UpdatePropertyRequest` (contrainte 8), et copie dans
      la duplication.
- [ ] `PropertyResource::entry_cost` (forme détail).
- [ ] Front : saisie dans l'assistant de publication et dans le formulaire de modification ;
      affichage sur la fiche et dans le comparateur.
- [ ] Factory et seeders : quelques biens en location mensuelle avec un coût d'entrée réaliste
      pour Dakar.

### 4. Confiance (V8)

- [ ] `buildUserLite()` : `phone_verified` (booléen).
- [ ] Front : le badge, l'encadré de prudence et les clés i18n fr/en/wo (bloc propre au ticket).

### 5. Bien retiré (V10)

- [ ] `PublicPropertyController::status()` + route `public.properties.status` + prédicat
      d'éligibilité composé (contrainte 10). `similar` par `SimilarPropertiesService::findSimilar`,
      6 au plus.
- [ ] Front : la fiche, sur un 404 amont, interroge `status` et rend l'état « retiré » ou le
      vrai 404 (contrainte 11).

### 6. Quartiers (V14)

- [ ] `PublicPropertyController::neighborhoods()` + `NeighborhoodsPublicPropertyRequest`
      (`city` requis) + route.
- [ ] Front : `location` devient la quatrième clé canonique, sous les conditions de la
      contrainte 12. Titre traduit. Une source « quartiers et villes » au sitemap, isolée comme
      les autres sources (`sitemap.ts:69`).

### 7. Portefeuilles (V15)

- [ ] Remplacer les six prédicats par `->publicPortfolio()`, ou par la sous-requête
      d'identifiants de `PublicProfileFacts::biensEligibles()` partout où la requête fait une
      jointure (piège n°7 : `status` ambigu).
- [ ] Test `tests/Feature/Public/PublicPortfolioPredicateTest.php`.

### 8. Bornes (V16)

- [ ] `index()` : borne 1..48 ; `reviews()` : borne 1..50, par repli (*clamp*) comme `sitemap()`.
      Supprimer la phrase devenue fausse du docblock de `sitemap()` (l.135-139).

### 9. Installation (V18)

- [ ] Front : manifeste (nom, icônes 192/512 dont une *maskable*, couleurs de la charte, `start_url`
      servie dans la bonne langue), service worker minimal (contrainte 14), page hors ligne.
- [ ] Corriger `src/i18n/routing.ts:98-99` pour qu'il dise ce qui est vrai **après** le ticket,
      ce qui a été mesuré.
- [ ] Supprimer `public/{file,globe,next,vercel,window}.svg`.

### 10. Visite virtuelle (V19)

- [ ] Colonne `virtual_tour_url` (migration ci-dessus). Règle `url:https` + liste d'autorisation
      d'hôtes en configuration (`config/catalogue.php` ou équivalent). Émission au premier niveau
      et dans `media_extra`.
- [ ] Front : saisie dans l'assistant et le formulaire de modification ; vignette sur la fiche
      (contrainte 13).

## Critères d'acceptation

- [ ] **AC1 (B1)** — En anonyme **et** avec le jeton d'un utilisateur sans lien avec le bien,
      `GET /api/public/properties/{slug}` et `GET /api/public/properties/compare?ids={id}` ne
      contiennent pas la clé `collaborators`, ni nulle part la valeur `30` de `commission_share`.
      Le test **rougit sur `e3ab4a4e`** et redevient rouge si l'on retire la condition de route
      (ablation consignée). `primary_contact` désigne toujours le collaborateur agent.
- [ ] **AC2** — `GET /api/properties/{id}` (authentifié, membre de l'agence) rend toujours
      `collaborators[].commission_share` : le correctif ne vide pas le tableau de bord.
- [ ] **AC3 (V17)** — Le corps JSON de `GET /api/public/properties/{slug}` avec le jeton du
      **propriétaire** du bien est identique au corps anonyme. Ce test rougit sur `e3ab4a4e`.
- [ ] **AC4** — Deux `GET` successifs de la fiche laissent `views_count` et `updated_at`
      inchangés en base.
- [ ] **AC5** — `POST …/view` depuis l'IP A, deux fois, puis depuis l'IP B, une fois, donne
      `views_count` = valeur initiale + 2. `updated_at` est inchangé, et
      `SimilarPropertiesService::invalidateForProperty` n'est pas appelé (espion). Un slug
      inconnu rend `204` sans écriture.
- [ ] **AC6** — Modifier `price` d'un bien public met en file **un**
      `RevalidatePublicPropertyPage` pour son slug. Changer `title` (et donc le slug) le met en
      file pour l'ancien **et** le nouveau slug. Un `POST …/view` n'en met aucun.
- [ ] **AC7** — Une deuxième visite de la même fiche, dans la fenêtre de revalidation, ne produit
      aucun appel à `GET /api/public/properties/{slug}` (mesuré côté API ou par test du front),
      et la vue est quand même comptée.
- [ ] **AC8 (V9)** — Pour un bien en location mensuelle à 300 000 XOF, avec `advance_months=2`,
      `deposit_months=2`, `agency_fee_months=1` et `monthly_charges=10 000`, `entry_cost.total`
      vaut **1 520 000**. Pour un bien en vente, `entry_cost` vaut `null`, et envoyer
      `deposit_months` rend 422.
- [ ] **AC9 (V8)** — `primary_contact.phone_verified` vaut `true` si et seulement si
      `phone_verified_at` est renseigné. Aucune clé `phone`, `phone_verified_at` ni `kyc*` n'est
      émise.
- [ ] **AC10 (V10)** — `GET …/status` rend `state=rented` pour un bien publié puis loué, avec
      `location.city`. Il rend **404** pour un brouillon, un bien `pending_review`, `rejected`,
      privé, `is_test`, jamais publié ou supprimé (six cas). Sur le front, la fiche d'un bien
      loué porte `noindex`, aucun JSON-LD `RealEstateListing`, et au moins un lien vers la
      recherche du quartier.
- [ ] **AC11 (V14)** — `GET …/neighborhoods?city=Dakar` fusionne « Mermoz » et « MERMOZ » en une
      seule entrée de compte 2. Une ville inconnue rend `data: []`. Le sitemap contient la page
      d'un quartier au-dessus du seuil, et non celle d'un quartier en dessous.
      `?city=Dakar&location=Inventé` a pour canonique `?city=Dakar`.
- [ ] **AC12 (V15)** — Un bien `available` + `public` avec `is_test=true`, et un autre avec
      `published_at=null`, n'apparaissent ni dans `agents/{slug}`, ni dans
      `agents/{slug}/properties`, ni dans `agencies/{slug}`, ni dans `agencies/{slug}/properties`,
      ni dans les comptes (`portfolio_count`, `stats`). Le test rougit sur `e3ab4a4e`.
- [ ] **AC13 (V16)** — `GET /api/public/properties?per_page=1000` rend `meta.per_page = 48`.
      `GET …/{slug}/reviews?per_page=1000` rend `meta.per_page = 50`. `per_page=0` rend `1` sur
      les deux.
- [ ] **AC14 (V18)** — `/manifest.webmanifest` répond 200 avec des icônes qui répondent 200. Le
      site est reconnu installable par l'audit du navigateur. Hors ligne, une fiche déjà mise en
      favori se relit depuis la page hors ligne. Après une connexion puis une déconnexion, aucune
      réponse authentifiée ni navigation HTML n'est présente dans les caches du service worker
      (relevé consigné). `public/` ne contient plus les cinq SVG.
- [ ] **AC15 (V19)** — `virtual_tour_url` accepte une URL `https` d'un hôte autorisé. Il refuse
      (422) `http://`, un hôte hors liste et `javascript:`. La fiche montre la vignette quand
      l'URL est renseignée, et rien sinon.
- [ ] **AC16** — Pint, `tsc --noEmit`, ESLint et les gardes `scripts/check-*.mjs` passent. Les
      tests touchés passent.

## Hors périmètre

- Le cache HTML de la page entière (ISR), qui exige de retirer la lecture du cookie de la mise en
  page racine (`src/app/layout.tsx:66-76`). Voir les questions au porteur.
- La transmission de l'IP du visiteur par `apiFetch` pour les **autres** appels serveur du site
  public (accueil, liste, profils), qui partagent aujourd'hui un seul seau du limiteur
  `public-read` (relevé dans les notes de rédaction).
- Le filtre de recherche « budget d'entrée », et le pré-remplissage du bail depuis le coût
  d'entrée (TCK-596).
- Le téléversement de fichiers vidéo (seul un lien est géré ici) ; tout prix indicatif en devise
  étrangère (décision du porteur).
- Les boutons de contact, WhatsApp et leads (TCK-590) ; le signalement (TCK-597) ; les alertes et
  les favoris de compte (TCK-599) ; le filtre « agence active » (TCK-600) ; le retrait du
  courtier (TCK-586) ; l'API de production absente (TCK-332).

## Notes d'implémentation

_(à remplir par implementing-specs)_
