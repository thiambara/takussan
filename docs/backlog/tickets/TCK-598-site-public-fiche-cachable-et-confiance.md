---
id: TCK-598
title: "Site public : la fiche publique divulgue la part de commission des collaborateurs et ne peut pas être mise en cache ; le coût d'entrée, la confiance, le bien loué, les quartiers et l'installation manquent"
status: done
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-08
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
tags: [back, front, public, securite, cache, rate-limit, seo, pwa, adr-requise]
---

## Objectif utilisateur

- **Visiteur** : sur la fiche d'un bien, il voit ce qu'il devra payer pour emménager, à qui il
  parle et si ce contact est vérifié. Un lien vers un bien déjà loué ne le laisse pas sans issue.
  Il trouve par un moteur de recherche les biens de son quartier, et il peut installer le site
  et relire ses favoris avec une connexion intermittente. Le site public ne lui renvoie pas une
  page d'erreur parce que d'autres visiteurs le consultent au même moment.
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
    `SimilarPropertiesService::invalidateForProperty()`, qui **vide l'étiquette entière**
    (`Services/Property/SimilarPropertiesService.php:155-158`, `Cache::tags(['property-similar'])->flush()`) :
    la vue d'un bien quelconque efface les biens similaires mis en cache de **tous** les biens ;
  - elle rajeunit `updated_at`, que le sitemap publie comme `lastModified` (`app/sitemap.ts:81`,
    lu par `PublicPropertyController::sitemap()`, l.153). Le sitemap annonce donc « modifié »
    un bien qui a seulement été vu.

  Une invalidation de cache branchée sur « le bien a été modifié » serait donc déclenchée par
  chaque vue. (Scout n'est pas touché : il écoute `saved`, qu'`increment()` ne déclenche pas ;
  l'audit non plus : `views_count` et `updated_at` ne sont pas `fillable`.)
- **Le même défaut existe sur la route authentifiée** `POST /api/properties/{property}/view`
  (`PropertyController::recordView`, `Api/PropertyController.php:261-270`, route
  `routes/api/properties.php:43`) : `$property->increment('views_count')`, avec une clé de
  déduplication **différente** (`property-view:{id}:{ip}` contre `views:{id}:{ip}`). Un même
  visiteur qui passe par les deux routes compte deux fois. Aucun appelant front (grep), un test
  (`tests/Feature/Api/UserAdminTest.php:156-166`).
- **Le compteur ne compte pas les visiteurs.** `getProperty()` (`lib/queries/public-property.ts:59-79`)
  passe par `apiFetch`, qui n'envoie ni `X-Forwarded-For` ni `Authorization` (`lib/api.ts:45-76`).
  L'API voit donc l'IP du serveur Next pour tout visiteur, et la clé `views:{id}:{ip}` est
  commune à tous : le compteur monte d'au plus 3 par heure et par bien. *Inféré de la lecture,
  pas mesuré en charge.* C'est un cas particulier du § 11.
- La page `/bookings` relit la fiche (`[locale]/(public)/bookings/page.tsx:81-86`) et compte ainsi
  une seconde vue. Elle interpole le paramètre `?property=` **sans** `encodeURIComponent` : le
  slug est une saisie du visiteur, et `?property=../properties?per_page=100000` fait appeler par
  le serveur Next `GET /api/public/properties?per_page=100000` (le `..` est résolu par l'analyseur
  d'URL de `fetch`), c'est-à-dire le catalogue sans borne du § 8, au nom du seau partagé du § 11.
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

### 11. Tout le rendu serveur du site public partage un seul seau du limiteur (V17, étendu)

- Tout le groupe `public` est sous `throttle:public-read` (`routes/api/public.php:10`) :
  90 requêtes par minute (`AppServiceProvider.php:323`), clé `visitorRateLimitKey()`
  (l.348-367) = `user:{id}` si un jeton Bearer est présent, sinon `ip:{Request::ip()}`.
- `apiFetch` n'envoie ni jeton ni `X-Forwarded-For` (`lib/api.ts:45-76`). Ses **neuf** appels
  côté serveur (hors `'use client'`, relevé par grep) partent donc tous avec l'IP du serveur Next :
  accueil (`lib/queries/public-discovery.ts:59`), liste (`public-search.ts:50`), fiche
  (`public-property.ts:62`), `/bookings` (`bookings/page.tsx:82`), pages agent et agence
  (`public-agent.ts:68`, `public-agency.ts:100`), index des profils et leur sitemap
  (`public-profiles.ts:162`), domaine des villes (`facettes.ts:48`), sitemap du catalogue
  (`sitemap-catalogue.ts:68`). **Tous les visiteurs rendus côté serveur partagent un seau de
  90 requêtes par minute** ; au-delà, chaque page publique rend son état d'erreur pour tout le
  monde. *Inféré de la lecture, non mesuré en charge.* (`profile-portfolio.ts` n'a pas de
  directive mais n'est importé que par un composant client.)
- Deux de ces appels sont **partagés** par conception : `facettes.ts:48-50`
  (`next: { revalidate: 3600 }`) et le sitemap (`app/sitemap.ts:48`, `revalidate = 3600`, qui
  appelle `sitemap-catalogue.ts` et `public-profiles.ts`). La clé du cache de données de Next
  porte l'URL **et** les options de `fetch`, en-têtes compris : un en-tête propre au visiteur
  y fragmenterait le cache, et lire les en-têtes entrants dans une route `revalidate` la rendrait
  dynamique.
- `apiRequest` transmet bien l'IP (l.515-520), mais **`resolveVisitorIp()` retient l'entrée la plus
  à gauche de `X-Forwarded-For`** (l.445-462, l.454) — celle que le visiteur écrit lui-même :
  Cloudflare, devant `preview.takussan.com` (`docs/infra/hebergement.md:21`), *ajoute* à un
  `X-Forwarded-For` reçu au lieu de le remplacer (comportement documenté par Cloudflare). Dès que
  l'en-tête est honoré par l'API, un visiteur choisit son seau à chaque requête (contournement des
  limiteurs `public-*`).
- **Le transport lui-même ne le laisse probablement pas passer.** L'API ne croit
  `X-Forwarded-For` que d'un mandataire listé dans `TRUSTED_PROXIES` (`bootstrap/app.php:33-36`).
  Le serveur Next appelle l'API par son nom public (`NEXT_PUBLIC_API_URL`, `lib/api.ts:3-6`), donc
  à travers Traefik, et le relevé d'infrastructure montre qu'un `X-Forwarded-For` forgé par un
  client n'atteint pas Laravel (`hebergement.md:83`, mesuré le 2026-09-14). Le serveur Next est un
  client comme un autre pour Traefik : l'IP que transmet `apiRequest` est vraisemblablement écartée
  aussi. *Inféré, à mesurer en préproduction avant tout correctif* (le correctif côté front seul
  serait vert en test et sans effet en préproduction).

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
   (`GET`) n'écrit plus en base. Les deux routes qui comptent (`public.properties.view` et
   `properties.view`) passent par **un seul** service de comptage, avec **une seule** clé de
   déduplication par (bien, IP) : un visiteur compte une fois, quelle que soit la route.
4. **Le compteur affiché peut avoir le retard du cache de la fiche** (tranché par le porteur le
   2026-10-06 : l'affichage du nombre de vues reste). C'est accepté et cela doit être écrit
   dans les notes d'implémentation, avec la durée de revalidation retenue.
5. **L'appel en cache de la fiche ne porte aucun en-tête propre au visiteur** (ni IP ni jeton).
   Sinon, la clé de cache se fragmente par visiteur et le cache ne sert à rien. Inversement, le
   comptage doit voir l'IP **du visiteur** : s'il transite par le serveur Next, celui-ci
   transmet l'IP selon la contrainte 16.
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
   *Option retenue par défaut* (non tranchée par le porteur) : les frais d'agence s'expriment
   **en mois de loyer** (`agency_fee_months`, 0,5 ou 1 le plus souvent), pas en montant fixe.
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
    s'il compte au moins N biens, N étant une constante nommée du code. Seuls les couples retenus
    entrent au sitemap. Une valeur hors domaine se replie sur la page nue, comme `city`
    aujourd'hui. *Options retenues par défaut* (non tranchées par le porteur) : **N = 3**, et
    l'URL de quartier reste en **paramètres** (`/properties?city=Dakar&location=Mermoz`), ce qui
    étend le module canonique existant (ADR-0026, TCK-433) sans nouvel arbre de routes.
13. **Visite virtuelle** : seulement une URL `https`, dont l'hôte appartient à une liste
    d'autorisation déclarée côté API (configuration, pas front). *Option retenue par défaut*
    (non tranchée) : `youtube.com`, `www.youtube.com`, `youtu.be`, `vimeo.com`, `player.vimeo.com`,
    `my.matterport.com`, `kuula.co`, comparaison exacte de l'hôte (pas de suffixe : `evilyoutube.com`
    est refusé). Lien seulement : aucun téléversement de fichier vidéo. Il n'y a pas de CSP
    (`next.config.ts:183-190`) : la liste d'autorisation est la seule barrière contre
    l'intégration d'une page arbitraire. **Aucun prix indicatif en devise étrangère** (tranché par le
    porteur le 2026-10-06).
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
    - **TCK-587 / TCK-591** possèdent d'autres méthodes de `PropertyController` (autorisation de
      `store`/`destroy`/`publish`/`unpublish`, clause de `index` ; routes `bulk-*`). 598 ne touche
      que **`recordView`** (l.261-270) : conflit de lignes voisines au plus, ordre indifférent.
    - **TCK-590, TCK-597** : leurs limiteurs (`public-contact-lead`, `public-visit-request`,
      `public-report`) sont clés par IP et passent par des actions serveur (`apiRequest`). Le § 11
      leur rend l'IP réelle du visiteur ; ils n'ont rien à changer. 598 seul modifie `lib/api.ts`
      (la transmission de l'IP) — aucun autre ticket de la vague ne le touche (grep).
16. **IP du visiteur dans les appels serveur** (§ 11) :
    - Tout appel serveur **rendu pour un visiteur** (accueil, liste, fiche hors cache, `/bookings`,
      pages agent et agence, index des profils, comptage de vue s'il passe par Next) transmet
      l'IP de ce visiteur, par `apiFetch` comme par `apiRequest`.
    - Un appel **partagé** — mis en cache de données (`revalidate`, étiquette), ou exécuté dans
      une route revalidée (le sitemap) — ne lit **pas** les en-têtes entrants et ne porte
      **aucun** en-tête propre au visiteur. Il est compté dans le seau du serveur front, une fois
      par revalidation et par URL : jamais au nom du premier visiteur qui l'a déclenché, et jamais
      une IP dans une clé de cache partagée. Le caractère « partagé » se déclare explicitement par
      l'appelant ; il ne se devine pas.
    - L'IP transmise est celle que la **chaîne de mandataires de confiance** a établie, jamais
      l'entrée la plus à gauche de `X-Forwarded-For`. Le nombre de sauts de confiance (ou l'en-tête
      que la périphérie réécrit) est une configuration par environnement, relevée par l'ADR
      (Vercel aujourd'hui pour `www`, Cloudflare + Traefik pour `preview`). Hors requête (build),
      rien n'est transmis.
    - Le chemin serveur Next → API doit **réellement** faire honorer l'en-tête par
      `TrustProxies` (§ 11, dernier point) : la preuve est une mesure en préproduction, pas un test
      unitaire. Aucun client extérieur ne doit pouvoir emprunter ce chemin de confiance (sinon tout
      le monde choisit son IP). Option retenue par défaut, à confirmer par l'ADR : appels serveur
      par l'adresse **interne** de l'API sur `dokploy-network` (sous-réseau déjà en tête de
      `TRUSTED_PROXIES`, `hebergement.md:82`), nouvelle clé d'environnement **serveur** du front
      (jamais `NEXT_PUBLIC_*`), avec repli sur l'URL publique quand elle est absente.

## Delta à produire

### 0. Décision

- [x] **ADR à écrire et accepter avant le code** : « Cache public de la fiche et du visiteur ».
      Il tranche quatre questions :
      - comment l'API invalide les données en cache du front (appel signé de l'API vers un
        handler de revalidation du front, plus une revalidation temporelle de plancher) ;
      - ce que devient l'invalidation tant que `master` est servie par Vercel et `preview` par le
        VPS, et avec plus d'une réplique du front (un cache par instance) ;
      - ce que le service worker a le droit de mettre en cache (contrainte 14) ;
      - **comment l'IP du visiteur traverse le serveur Next jusqu'à `Request::ip()`** (contrainte
        16) : quel chemin réseau le serveur Next emprunte vers l'API dans chaque environnement,
        quels mandataires `TRUSTED_PROXIES` liste, quel en-tête ou quel nombre de sauts le front
        croit, et comment un client extérieur est empêché d'emprunter ce chemin.

      Options retenues par défaut (non tranchées par le porteur) : un cache de données par
      étiquette `property:{slug}` avec une revalidation de 300 s, plus l'appel signé ; appels
      serveur par l'adresse interne de l'API (contrainte 16). L'ISR du HTML reste hors
      périmètre : c'est une limite d'architecture (la mise en page racine lit le cookie), pas un
      défaut.
- [ ] **→ au porteur** (environnement déployé : `preview`). Commande exacte : ADR-0052 §6, à lancer AVANT de poser `API_INTERNAL_URL` et `VISITOR_IP_TRUSTED_HOPS`. **Mesure avant le code, consignée dans l'ADR** : sur `preview`, une page publique rendue
      côté serveur avec `apiRequest` (qui transmet déjà l'IP) — l'IP qui atteint Laravel est-elle
      celle du visiteur ou celle du serveur front ? (§ 11, dernier point : inféré, non mesuré).

### 1. Fuite des collaborateurs (B1)

- [x] `PropertyResource` : émettre `collaborators` seulement si la route n'est pas `public.*`.
      Garder l'eager-load de `show`/`compare` (requis par `PrimaryPropertyContact`).
- [x] Test `tests/Feature/Public/PropertyCollaboratorsNotExposedTest.php` : `show` et `compare`,
      en anonyme puis avec le jeton d'un utilisateur quelconque, sur un bien qui a un
      collaborateur agent avec `commission_share = 30`.

### 2. Fiche cachable et compteur juste (V17)

- [x] `PublicPropertyController::show()` : retirer l'incrément.
- [x] `App\Services\Property\PropertyViewCounter::record(Property, string $ip): void` :
      déduplication par (bien, IP) sur une heure (clé unique `property-view:{id}:{ip}`, 3 par
      heure comme aujourd'hui), puis
      `Property::query()->whereKey($id)->increment('views_count')` — constructeur de requêtes,
      **pas** `$property->increment()` : ni `updated_at`, ni `updating`/`updated`.
- [x] `PublicPropertyController::view()` + route `public.properties.view` + limiteur
      `public-view` (`AppServiceProvider`) : appelle le service.
- [x] `PropertyController::recordView()` (`Api/PropertyController.php:261-270`) : appelle le
      même service au lieu de `$property->increment()` ; sa réponse (`data.views_count`) est
      inchangée. Mettre à jour `UserAdminTest::test_record_view_on_property` seulement si la
      forme change (elle ne doit pas).
- [x] `PropertyResource` : sur les routes `public.*`, rendre le corps indépendant de
      l'appelant (contrainte 2).
- [x] `App\Observers\PropertyPublicCacheObserver` (enregistré dans `AppServiceProvider`) + job
      `App\Jobs\RevalidatePublicPropertyPage` (appel signé, nouvel essai si échec, sans effet
      quand la configuration est absente). Champs déclencheurs : contrainte 6.
- [x] Front : la fiche lit ses données par un appel mis en cache, étiqueté par slug et
      invalidable. Un handler protégé par secret reçoit l'invalidation. La vue est comptée par un
      appel séparé, sans bloquer la page et sans le refaire au rafraîchissement d'un composant.
- [x] Front `/bookings` : encoder le slug lu dans `?property=` comme **un seul segment** de
      chemin, et ne plus compter de vue (automatique une fois l'incrément retiré de `show`).
      Test du front (AC20).
- [x] Réécrire les assertions qui affirment l'incrément dans `show` : `CataloguePublicCacheTest`
      (l.133-145), et `PropertyResourceSparseFieldsTest` si son l.221 en dépend. Garder leur
      partie « variante authentifiée ».
- [x] Commentaire de route `routes/api/public.php:86-105` : le mettre à jour, puisque ses trois
      refus ne tiennent plus.

### 3. Coût d'entrée (V9)

- [x] La migration ci-dessus. `Property::$fillable` et `$casts`.
- [x] Règles dans `StorePropertyRequest` et `UpdatePropertyRequest` (contrainte 8), et copie dans
      la duplication.
- [x] `PropertyResource::entry_cost` (forme détail).
- [x] Front : saisie dans l'assistant de publication et dans le formulaire de modification ;
      affichage sur la fiche et dans le comparateur.
- [x] Factory et seeders : quelques biens en location mensuelle avec un coût d'entrée réaliste
      pour Dakar.

### 4. Confiance (V8)

- [x] `buildUserLite()` : `phone_verified` (booléen).
- [x] Front : le badge, l'encadré de prudence et les clés i18n fr/en/wo (bloc propre au ticket).

### 5. Bien retiré (V10)

- [x] `PublicPropertyController::status()` + route `public.properties.status` + prédicat
      d'éligibilité composé (contrainte 10). `similar` par `SimilarPropertiesService::findSimilar`,
      6 au plus.
- [x] Front : la fiche, sur un 404 amont, interroge `status` et rend l'état « retiré » ou le
      vrai 404 (contrainte 11).

### 6. Quartiers (V14)

- [x] `PublicPropertyController::neighborhoods()` + `NeighborhoodsPublicPropertyRequest`
      (`city` requis) + route.
- [x] Front : `location` devient la quatrième clé canonique, sous les conditions de la
      contrainte 12. Titre traduit. Une source « quartiers et villes » au sitemap, isolée comme
      les autres sources (`sitemap.ts:69`).

### 7. Portefeuilles (V15)

- [x] Remplacer les six prédicats par `->publicPortfolio()`, ou par la sous-requête
      d'identifiants de `PublicProfileFacts::biensEligibles()` partout où la requête fait une
      jointure (piège n°7 : `status` ambigu).
- [x] Test `tests/Feature/Public/PublicPortfolioPredicateTest.php`.

### 8. Bornes (V16)

- [x] `index()` : borne 1..48 ; `reviews()` : borne 1..50, par repli (*clamp*) comme `sitemap()`.
      Supprimer la phrase devenue fausse du docblock de `sitemap()` (l.135-139).

### 9. Installation (V18)

- [x] Front : manifeste (nom, icônes 192/512 dont une *maskable*, couleurs de la charte, `start_url`
      servie dans la bonne langue), service worker minimal (contrainte 14), page hors ligne.
- [x] Corriger `src/i18n/routing.ts:98-99` pour qu'il dise ce qui est vrai **après** le ticket,
      ce qui a été mesuré.
- [x] Supprimer `public/{file,globe,next,vercel,window}.svg`.

### 10. Visite virtuelle (V19)

- [x] Colonne `virtual_tour_url` (migration ci-dessus). Règle `url:https` + liste d'autorisation
      d'hôtes en configuration (`config/catalogue.php` ou équivalent). Émission au premier niveau
      et dans `media_extra`.
- [x] Front : saisie dans l'assistant et le formulaire de modification ; vignette sur la fiche
      (contrainte 13).

### 11. IP du visiteur dans les appels serveur (§ 11)

- [ ] **→ au porteur** pour la partie environnement : poser dans Dokploy `API_INTERNAL_URL=http://api:8080`, `VISITOR_IP_TRUSTED_HOPS=2`, `PUBLIC_CACHE_REVALIDATE_SECRET` (front) et `PUBLIC_CACHE_REVALIDATE_URL`/`PUBLIC_CACHE_REVALIDATE_SECRET` (API) — liste dans `docs/infra/hebergement.md`. Fait côté dépôt (`dd30ccc6`) : les clés documentées dans `takussan-web/.env.example` et `hebergement.md`, `TRUSTED_PROXIES` inchangé (l'ADR ne le demande pas ; `check-env-parity` vert). Infrastructure, selon l'ADR (Delta 0) : chemin serveur Next → API qui fait honorer
      l'en-tête par `TrustProxies`, et que nul client extérieur ne peut emprunter. Clé(s)
      d'environnement nouvelles du front documentées dans `takussan-web/.env.example` et dans
      `docs/infra/hebergement.md` (clés de chaque environnement) ; `TRUSTED_PROXIES` de
      `.env.example` / `.env.docker` inchangé sauf si l'ADR le demande (parité :
      `check-env-parity.mjs`).
- [x] Front, `lib/api.ts` : l'IP du visiteur est établie **une seule fois**, selon la contrainte 16
      (chaîne de confiance configurée, jamais l'entrée la plus à gauche), et sert à `apiFetch`
      comme à `apiRequest`. `apiFetch` côté serveur la transmet par défaut ; l'appelant déclare
      explicitement un appel **partagé**, qui ne lit pas les en-têtes entrants et n'en transmet
      aucun.
- [x] Front : déclarer partagés le domaine des villes (`facettes.ts`), le sitemap du catalogue,
      la pagination des profils **quand elle sert le sitemap** (`listerSlugsDeProfils`), et la
      lecture mise en cache de la fiche (Delta 2). Les autres appels serveur du § 11 restent
      rendus pour le visiteur.
- [x] Tests du front : AC17, AC18, AC19 (avec `next/headers` simulé).
- [x] API : `tests/Feature/Public/PublicReadLimiterPerVisitorTest.php` (AC21, contrat sur lequel
      le front s'appuie).
- [x] Commentaires à rendre vrais : le docblock de `resolveVisitorIp()` (`lib/api.ts:434-444`, qui
      affirme que la transmission suffit), celui de `bootstrap/app.php:26-32` si l'ADR change le
      chemin, et la ligne « IP du client jusqu'à Laravel » de `hebergement.md` (ajouter le cas
      serveur front → API, avec la mesure de l'AC22).

## Critères d'acceptation

- [x] **AC1 (B1)** — En anonyme **et** avec le jeton d'un utilisateur sans lien avec le bien,
      `GET /api/public/properties/{slug}` et `GET /api/public/properties/compare?ids={id}` ne
      contiennent pas la clé `collaborators`, ni nulle part la valeur `30` de `commission_share`.
      Le test **rougit sur `e3ab4a4e`** et redevient rouge si l'on retire la condition de route
      (ablation consignée). `primary_contact` désigne toujours le collaborateur agent.
- [x] **AC2** — `GET /api/properties/{id}` (authentifié, membre de l'agence) rend toujours
      `collaborators[].commission_share` : le correctif ne vide pas le tableau de bord.
- [x] **AC3 (V17)** — Le corps JSON de `GET /api/public/properties/{slug}` avec le jeton du
      **propriétaire** du bien est identique au corps anonyme. Ce test rougit sur `e3ab4a4e`.
- [x] **AC4** — Sur un bien dont `updated_at` est posé au `2026-01-01 00:00:00`, deux `GET`
      successifs de la fiche laissent `views_count` **et** `updated_at` inchangés en base,
      `SimilarPropertiesService::invalidateForProperty` n'est pas appelé (espion), et
      `GET /api/public/properties/sitemap` rend toujours `updated_at = 2026-01-01T00:00:00…` pour ce
      bien. **Rougit sur `e3ab4a4e`** (`views_count` +1, `updated_at` rajeuni, espion appelé).
- [x] **AC5** — `POST …/view` depuis l'IP A, deux fois, puis depuis l'IP B, une fois, donne
      `views_count` = valeur initiale + 2. `updated_at` (posé au `2026-01-01`) est inchangé, et
      `invalidateForProperty` n'est pas appelé (espion). Un slug inconnu rend `204` sans écriture.
      **Ablation consignée** : remplacer l'incrément du service par `$property->increment()` rougit
      (date et espion) ; l'envelopper dans `Property::withoutEvents()` rougit encore (date).
- [x] **AC6** — Modifier `price` d'un bien public met en file **un**
      `RevalidatePublicPropertyPage` pour son slug. Changer `title` (et donc le slug) le met en
      file pour l'ancien **et** le nouveau slug. Un `POST …/view` n'en met aucun.
- [x] **AC7** — Une deuxième visite de la même fiche, dans la fenêtre de revalidation, ne produit
      aucun appel à `GET /api/public/properties/{slug}` (mesuré côté API ou par test du front),
      et la vue est quand même comptée.
- [x] **AC8 (V9)** — Pour un bien en location mensuelle à 300 000 XOF, avec `advance_months=2`,
      `deposit_months=2`, `agency_fee_months=1` et `monthly_charges=10 000`, `entry_cost.total`
      vaut **1 520 000**. Pour un bien en vente, `entry_cost` vaut `null`, et envoyer
      `deposit_months` rend 422.
- [x] **AC9 (V8)** — `primary_contact.phone_verified` vaut `true` si et seulement si
      `phone_verified_at` est renseigné. Aucune clé `phone`, `phone_verified_at` ni `kyc*` n'est
      émise.
- [x] **AC10 (V10)** — `GET …/status` rend `state=rented` pour un bien publié puis loué, avec
      `location.city`. Il rend **404** pour un brouillon, un bien `pending_review`, `rejected`,
      privé, `is_test`, jamais publié ou supprimé (six cas). Sur le front, la fiche d'un bien
      loué porte `noindex`, aucun JSON-LD `RealEstateListing`, et au moins un lien vers la
      recherche du quartier.
- [x] **AC11 (V14)** — `GET …/neighborhoods?city=Dakar` fusionne « Mermoz » et « MERMOZ » en une
      seule entrée de compte 2. Une ville inconnue rend `data: []`. Le sitemap contient la page
      d'un quartier au-dessus du seuil, et non celle d'un quartier en dessous.
      `?city=Dakar&location=Inventé` a pour canonique `?city=Dakar`.
- [x] **AC12 (V15)** — Un bien `available` + `public` avec `is_test=true`, et un autre avec
      `published_at=null`, n'apparaissent ni dans `agents/{slug}`, ni dans
      `agents/{slug}/properties`, ni dans `agencies/{slug}`, ni dans `agencies/{slug}/properties`,
      ni dans les comptes (`portfolio_count`, `stats`). Le test rougit sur `e3ab4a4e`.
- [x] **AC13 (V16)** — `GET /api/public/properties?per_page=1000` rend `meta.per_page = 48`.
      `GET …/{slug}/reviews?per_page=1000` rend `meta.per_page = 50`. `per_page=0` rend `1` sur
      les deux.
- [x] **AC14 (V18)** — `/manifest.webmanifest` répond 200 avec des icônes qui répondent 200. Le
      site est reconnu installable par l'audit du navigateur. Hors ligne, une fiche déjà mise en
      favori se relit depuis la page hors ligne. Après une connexion puis une déconnexion, aucune
      réponse authentifiée ni navigation HTML n'est présente dans les caches du service worker
      (relevé consigné). `public/` ne contient plus les cinq SVG.
- [x] **AC15 (V19)** — `virtual_tour_url` accepte une URL `https` d'un hôte autorisé. Il refuse
      (422) `http://`, un hôte hors liste et `javascript:`. La fiche montre la vignette quand
      l'URL est renseignée, et rien sinon.
- [x] **AC16 (V17, route authentifiée)** — `POST /api/properties/{id}/view` (authentifié) rend
      toujours `data.views_count` = initial + 1, laisse `updated_at` (posé au `2026-01-01`)
      inchangé et n'appelle pas l'espion ; un `POST /api/public/properties/{slug}/view` depuis la
      **même IP** dans l'heure n'ajoute rien (déduplication commune). Rougit sur `e3ab4a4e`.
- [x] **AC17 (§ 11, deux visiteurs → deux seaux)** — Test du front, pour chacun des appels
      serveur rendus pour le visiteur (accueil, liste, `/bookings`, page agent, page agence,
      index des profils) : rendus dans deux requêtes dont la chaîne de confiance désigne
      `203.0.113.1` puis `203.0.113.2`, les requêtes sortantes vers l'API portent
      `X-Forwarded-For: 203.0.113.1` puis `203.0.113.2`. **Rougit sur `e3ab4a4e`** : aucune ne porte
      d'en-tête. Ablation : retirer la transmission de `apiFetch` rougit.
- [x] **AC18 (§ 11, appels partagés)** — Test du front : le domaine des villes, le sitemap du
      catalogue, la pagination des profils pour le sitemap et la lecture en cache de la fiche
      n'émettent **aucun** `X-Forwarded-For` et ne lisent pas les en-têtes entrants (le
      `next/headers` simulé lève s'il est appelé), même dans une requête qui en porte. Relevé
      consigné : `next build` liste toujours `/sitemap.xml` avec une revalidation d'une heure.
      Ablation : transmettre l'IP par défaut sans exception rougit.
- [x] **AC19 (§ 11, IP non falsifiable)** — Test du front : avec la configuration d'un saut de
      confiance, une requête entrante `X-Forwarded-For: 198.51.100.9, 203.0.113.5` fait transmettre
      `203.0.113.5`, jamais `198.51.100.9`, par `apiFetch` **et** `apiRequest`. Rougit sur
      `e3ab4a4e` (`apiRequest` transmet `198.51.100.9`, `lib/api.ts:454`).
- [x] **AC20 (`/bookings`)** — Test du front : `/bookings?property=..%2Fproperties%3Fper_page%3D100000`
      ne fait qu'une requête à l'API, sur le chemin `/api/public/properties/..%2Fproperties%3Fper_page%3D100000`
      (un seul segment), et la page rend l'état « introuvable ». Rougit sur `e3ab4a4e` (requête
      sur `/api/public/properties?per_page=100000`).
- [x] **AC21 (API, contrat)** — `PublicReadLimiterPerVisitorTest` : depuis `REMOTE_ADDR` de
      confiance, 90 `GET /api/public/properties` avec `X-Forwarded-For: 203.0.113.1`, puis le 91ᵉ
      rend `429` ; au même instant, `X-Forwarded-For: 203.0.113.2` rend `200`. Depuis un
      `REMOTE_ADDR` **non** listé, l'en-tête est ignoré (le 91ᵉ, toutes valeurs confondues, rend
      `429`). Vert dès aujourd'hui : il fige le contrat dont dépend l'AC22.
- [ ] **→ au porteur** — commande exacte : ADR-0052 §6 (`docker exec … php artisan tinker --execute="… RateLimiter::attempts(md5(\"public-read\".\"ip:\".\$ip)) …"` sur `takussan-api-preview-4iza80-api-1`), avant puis après la pose des clés. **AC22 (§ 11, mesure de bout en bout)** — Sur `preview`, après le déploiement : deux
      visiteurs de deux réseaux distincts chargent `/fr/properties`. Relevé consigné dans les notes
      d'implémentation : `RateLimiter::attempts(md5('public-read'.'ip:<IP du visiteur>'))` est
      positif pour **chacune** des deux IP, et le compteur de l'IP du serveur front n'a pas
      bougé pour ces rendus. La même mesure faite **avant** le correctif (Delta 0) est consignée
      à côté. Un en-tête `X-Forwarded-For` forgé par l'un des visiteurs ne change pas sa clé.
- [x] **AC23** — Pint, `tsc --noEmit`, ESLint et les gardes `scripts/check-*.mjs` passent. Les
      tests touchés passent.

## Hors périmètre

- Le cache HTML de la page entière (ISR), qui exige de retirer la lecture du cookie de la mise en
  page racine (`src/app/layout.tsx:66-76`). C'est une limite d'architecture, pas un défaut :
  aucun comportement faux n'en découle (seul `sitemap.ts` déclare `revalidate`, et il n'est pas
  sous la mise en page racine). Option retenue par défaut.
- Un seau propre aux appels **partagés** du serveur front (contrainte 16), au-delà de celui de son
  IP : amélioration si le sitemap des profils (jusqu'à 200 pages, `public-profiles.ts:255`)
  approche un jour les 90 requêtes par minute ; ce n'est pas le cas à l'échelle actuelle.
- Une CSP (`next.config.ts:183-190`) : durcissement, la liste d'autorisation de la contrainte 13
  suffit à fermer l'intégration arbitraire.
- Le filtre de recherche « budget d'entrée », et le pré-remplissage du bail depuis le coût
  d'entrée (TCK-596).
- Le téléversement de fichiers vidéo (seul un lien est géré ici, option retenue par défaut) ;
  tout prix indicatif en devise étrangère (tranché par le porteur le 2026-10-06 : pas pour
  l'instant).
- Les boutons de contact, WhatsApp et leads (TCK-590) ; le signalement (TCK-597) ; les alertes et
  les favoris de compte (TCK-599) ; le filtre « agence active » (TCK-600) ; le retrait du
  courtier (TCK-586) ; l'API de production absente (TCK-332).

## Notes d'implémentation

Relevés et décisions non évidentes, au fil de l'eau (2026-10-08, branche `feat/tck-598-site-public`
partie de `06a0f7f0`). Les numéros de ligne du Contexte ont bougé avec 590/591/592 ; les constats
tiennent tous, relus un par un.

- **Delta 0** — ADR-0052 commité seul (`e87a5523`), avant tout code. Il tranche les quatre questions
  par écrit ; l'IP vue par Laravel sur le chemin serveur Next → API y est déclarée **inférée, non
  mesurée** (§ 6), la mesure revenant au porteur.
- **Écart avec le Delta 2 (prescription fausse, mesurée)** : `Property::query()->whereKey($id)->increment()`
  écrit `updated_at` — `Eloquent\Builder::increment()` appelle `addUpdatedAtColumn()`
  (`vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php:1347-1351`). Le service passe
  par `->toBase()->increment()`. Ablation A6 (constructeur Éloquent) : rouge sur la date.
- **Contrainte 2** : `PropertyResource` lit `routeIs('public.*')` une fois. Les champs de modération
  et l'e-mail des collaborateurs suivent `$appelantConnu` (connu ET hors `public.*`) ; `?raw=1` et
  `original` signé ne s'ouvrent plus sur `public.*`. Le repli WebP de TCK-585 (`PublicPhotoUrl`) n'est
  pas touché. `PropertyModerationFieldsTest` lisait les quatre champs sur la fiche PUBLIQUE avec un
  jeton : il les lit désormais sur `properties.show`, la route que le tableau de bord appelle.
- **Comptage** : la vue part du navigateur directement vers l'API (ADR-0052 §1) ; le corps de
  `show()` ne change donc plus d'un appel à l'autre (`CataloguePublicCacheTest` asserte l'identité
  au lieu de la divergence, comme son propre docblock le demandait).

- **Invalidation (Delta 2)** : l'observateur invalide sur « une colonne a changé » moins une liste
  d'exclusions (`views_count`, `favorites_count`, `updated_at`), et non sur une liste de champs
  servis — celle-ci oublierait le prochain champ de la fiche. Ablation B3 (exclusions retirées) :
  verte tant que seul le comptage de vue l'éprouvait (il ne passe plus par Éloquent) ; le test
  `test_un_compteur_incremente_par_le_modele_n_invalide_rien` la fait rougir.
  **Écart AC6** : le slug ne suit PAS le titre (il n'est posé qu'à la création) ; le test change
  donc le slug lui-même, et vérifie que les DEUX étiquettes partent.
- **Coût d'entrée (Delta 3)** : une seule définition, `App\Services\Property\CoutDEntree` (formule,
  applicabilité, règles). La modification juge le contrat **résultant** (envoyé, sinon celui du
  bien) : un `PUT {contract_type: sale, deposit_months: 1}` rend 422. Le total est arrondi par
  `Currency::decimalPlacesOf()`, moitié vers le haut, comme `amountDue()` (TCK-593). La duplication
  copie les colonnes sans code : `PropertyDuplicationService` passe par `replicate()`, qui exclut une
  liste et prend le reste. Seeder : 65 % des locations reçoivent un coût d'entrée (2 mois de caution
  le plus souvent, 1 à 3 d'avance, ½ ou 1 mois de frais) ; état de fabrique `withEntryCost()`.
- **Visite virtuelle (Delta 10)** : `App\Rules\HoteDeVisiteVirtuelle`, hôte de `parse_url` comparé
  EXACTEMENT à `config('catalogue.virtual_tour_hosts')` ; `url:https` à côté. `https://youtube.com@evil.example`
  a pour hôte `evil.example` : refusé.
- **Deux tests rendus faux par la contrainte 2, réécrits** : `PropertyPhotoExposureTest::test_view_raw_receives…`
  et `PropertyMediaConversionsTest::test_authorized_caller_still_receives_the_source_file` lisaient
  l'original signé du super-admin sur la fiche PUBLIQUE. Ils le lisent sur `properties.show`, et le
  premier asserte en plus que la fiche publique ne le rend pas au même super-admin.
- **Ablations C1–C5** (`ablations-b3.log`) : `prohibitedIf(false)` → 2 rouges ; hôte par suffixe → 1 ;
  `url` sans `:https` → 1 ; total sans arrondi → 1 ; la modification juge `true` → 1. Toutes
  restaurées par copie, md5 identique.
- **Bien retiré (Delta 5)** : `App\Services\Property\EtatPublicDuBien`. Le prédicat d'éligibilité
  **applique `scopePublic()` tel quel** à une copie de la ligne dont seul le statut est remplacé
  (`jsonb_populate_record(NULL::properties, to_jsonb(p) || '{"status":"available"}')`, sous l'alias
  `properties`) : aucun critère recopié, et le filtre « agence active » de TCK-600 sera hérité sans
  une ligne. **Preuve par ablation** : D7 ajoute un critère à `scopePublic()` et un test qui l'éprouve
  sur `/status` → vert (hérité) ; D8 fait la même chose avec un prédicat RECOPIÉ → rouge. Brouillon,
  `pending_review`, `rejected` sont écartés par statut avant (la mécanique de modération ne fuit pas) ;
  le 404 est comparé **octet pour octet** à celui d'un slug inconnu, sur sept cas (les six de l'AC +
  supprimé à part). `similar` repasse par `->public()` : `findSimilar()` met en cache des
  identifiants, et un bien retiré entre-temps y resterait (le même défaut vit dans `similar()`,
  hors périmètre, noté).
- **Quartiers (Delta 6, API)** : `neighborhoods()` replie quartier ET ville par `CaseInsensitive`
  (`MÉDINA`/`Médina` fondus — D4, `lower()` nu, rougit), rend la graphie la plus fréquente
  (`mode() WITHIN GROUP`), plafond `catalogue.neighborhoods_max` (300) avec `truncated`.
  ⚠ La recherche filtre le quartier par égalité Meilisearch (`PropertySearchService:373`) : la
  page `location=Mermoz` trouve-t-elle les biens saisis `MERMOZ` ? **Non mesuré** — noté pour la
  session.
- **Portefeuilles (Delta 7)** : les six prédicats passent par `publicPortfolio()` ; les deux
  `citiesCount` (jointure sur `addresses`) par la sous-requête d'identifiants. Ablations F1–F6 :
  chaque site rendu seul à l'ancien prédicat rougit `PublicPortfolioPredicateTest` ; E1 (les deux
  contrôleurs de `06a0f7f0`) → 3 rouges sur 3.
- **Bornes (Delta 8)** : `parPage()` ramène dans `1..48` / `1..50` ; D6 (sans plafond) → 2 rouges.
- **AC21** : `PublicReadLimiterPerVisitorTest`, trois tests. G1 (`trustProxies('*')`) → 2 rouges ;
  G2 (seau unique) → 1 rouge.

- **Front, fiche (Delta 2, `cd3ffb19`)** : `getProperty` lit en cache de données (`revalidate: 300`,
  étiquette `property:{slug}`, appel partagé : seuls `Accept` et `Accept-Language` dans la clé).
  `POST /api/revalidation/fiche` vérifie `t=…,v1=…` (HMAC-SHA256 de `<t>.<corps brut>`,
  `timingSafeEqual`, fenêtre ±300 s, 50 slugs au plus) et expire par `revalidateTag(tag, { expire: 0 })`
  — `'max'` servirait encore une fois la version périmée (H8 rougit). Secret vide → 401 toujours
  (H7). `CompteurDeVue` : un `POST` direct vers l'API, `credentials: 'omit'`, gardé par un `useRef`
  (H9 : sans garde, deux vues en mode strict). Le compteur affiché a jusqu'à 300 s de retard
  (conséquence écrite dans l'ADR).
- **Bien retiré, front** : Next 16.3.1 n'admet comme statut d'interruption que 404/403/401
  (`http-access-fallback.js`) ; la page d'un bien loué/vendu/retiré est donc un **200 `noindex,
  follow`**, sans `alternates` ni JSON-LD, avec ses similaires et un lien vers la recherche du
  quartier. `/status` en 404 → le vrai `notFound()`. H10 (indexable) et H11 (devient 404) rougissent.
- **IP du visiteur (Delta 11, front)** : `ipDuVisiteur(xff, h)` retient l'entrée `max(0, n − h)` ;
  plus de repli sur `x-real-ip` (il n'est pas dans la chaîne de confiance). `apiFetch` la transmet par
  défaut côté serveur, `partage: true` ne lit pas `next/headers` (le double lève). Chemin interne :
  `API_INTERNAL_URL` + `X-Forwarded-Host/Proto/Port` dérivés de l'URL publique. Ablations H0–H3.
  Les deux tests hérités de `api.test.ts` qui affirmaient l'entrée de gauche et le repli
  `x-real-ip` sont réécrits : ils affirmaient le défaut.
- **Quartiers, front (`f2efb0ef`)** : `SEUIL_QUARTIER_INDEXABLE = 3` (option par défaut, non tranchée
  par le porteur), jugé dans `quartiersDeLaVille` et nulle part ailleurs. `location` n'est retenu
  qu'avec une ville RETENUE. Le sitemap annonce les chemins que produit `cheminCanoniqueDeLaListe`
  elle-même. **Next n'échappe pas le XML du sitemap** (`resolve-route-data.js`) : le `&` des pages
  de quartier est échappé dans `construireSitemap` ; le test parse le XML que Next en tire.
  Ablations Q1–Q7, toutes rouges.
- **Relevés locaux, 2026-10-08** (build de production du front sur :3114 contre une API :8114 lancée
  sur une COPIE migrée de la base de dev, `SCOUT_DRIVER=collection`, copie supprimée ensuite) :
  - AC7 : trois `GET /fr/properties/<slug>` → **un seul** `GET /api/public/properties/<slug>` dans le
    journal de l'API (0,47 s puis 0,036 s et 0,027 s) ;
  - AC18 : `next build` liste `/sitemap.xml` en `○`, revalidation **1h**, expiration 1y ;
  - AC11 : `/sitemap.xml` bien formé (987 `<loc>`), 10 villes et 20 quartiers de Dakar par langue,
    `location=Mermoz` présent ; aucun quartier du jeu de démonstration n'est sous le seuil (le cas
    « en dessous » est éprouvé par les tests). `?city=dakar&location=MERMOZ` → canonique
    `?city=Dakar&amp;location=Mermoz`, titre « Biens immobiliers à Mermoz, Dakar » ;
    `?city=Dakar&location=Inventé` → canonique `?city=Dakar` ; `?location=Mermoz` → page nue ;
  - AC14 : `/manifest.webmanifest` 200, trois icônes 200 (`image/png`, une `maskable`), `/sw.js` 200,
    les cinq SVG 404. Chrome sans tête piloté par CDP : `Page.getInstallabilityErrors` → `[]`,
    `Page.getAppManifest` → aucune erreur ; un favori local → `by-ids?ids=407` en cache ; connexion
    (cookie `httpOnly` posé par `set-token`, `/app` servie), appels authentifiés, déconnexion : les
    caches ne portent **aucune** navigation HTML ni aucune requête avec `Authorization` (35 statiques
    `/_next/static/*`, et les seules réponses by-ids anonymes). Front arrêté : la navigation rend la
    page hors ligne construite (`noindex`), qui liste le favori depuis le cache.
    ⚠ Après la déconnexion, deux réponses by-ids **anonymes** de plus (`ids=72,77`, `ids=77`) : le
    magasin local a gardé des favoris venus du compte. Données publiques, sans identifiants — mais
    le maintien des favoris du compte dans `localStorage` après déconnexion relève de
    `lib/queries/favorites.ts` (TCK-599), hors de ce ticket.
  - Non mesuré : Lighthouse lui-même (l'installabilité est relevée par l'API du navigateur), et
    rien sur `preview` (au porteur).
- **Recherche par quartier et casse (Meilisearch)** : non mesurée — la clé Meilisearch du `.env` local
  ne correspond pas au conteneur (dette D-48). Reste une question pour la session.
- **AC21** : la route éprouvée est désormais `/api/public/properties`, celle que l'AC nomme ; G1 → 2
  rouges, G2 → 1 rouge, rejouées sur cette route.
