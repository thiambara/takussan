# CLAUDE.md — `takussan-api/`

Conventions du backend Laravel 13. **Elles sont établies et lisibles dans le code — ne pas les
redécouvrir, ne pas en inventer une seconde.** Le contexte produit, les principes non négociables et
le workflow git sont dans le `CLAUDE.md` de la racine.

Chaque convention ci-dessous porte son **fichier exemplaire** : en cas de doute, lire celui-là.

---

## Réponse JSON — `Base\Controller::json()`

Tout contrôleur étend `app/Http/Controllers/Base/Controller.php` (147 des 161 le font) et répond par
`$this->json(...)`. La convention est massive et sans ambiguïté : **465 `$this->json(...)` contre 8
`response()->json(...)`**.

L'erreur métier est `['message' => …]` — 50 occurrences. `['error' => …]` n'apparaît **qu'une fois**
et `['errors' => …]` **jamais** : ne pas en introduire.

L'enveloppe HTTP globale est dans `bootstrap/app.php:57-74` — toute `HttpExceptionInterface` sur une
route `api/*` devient `{message}` avec son statut.

> ⚠️ Un second `app/Http/Controllers/Controller.php` coexiste, presque inutilisé. Étendre
> `Base\Controller`, jamais celui-là.

## Le filtrage/tri/include passe par `HasQueryBuilder`

**Fichier exemplaire : `app/Models/Property.php:29-99`.** Le cœur est
`app/Models/Concerns/HasQueryBuilder.php` — `static::buildQuery(?Builder, ?Request): QueryBuilder`,
piloté par **7 propriétés statiques déclaratives** sur le modèle :

| Propriété | Effet |
|---|---|
| `$requestFilterable` | `filter[col]=` exact |
| `$requestFilterablePartial` | `filter[col]=` partiel |
| `$requestRangeFilters` | génère `filter[col_min]` / `filter[col_max]` |
| `$requestSearchFields` | `filter[search]=` (route vers Scout si le modèle est `Searchable`, sinon LIKE) |
| `$requestSortable` | `sort=-col` |
| `$requestLoadable` | `include=relation` |
| `$requestCountable` | `include=relationCount` |
| `$queryFields` | `fields[table]=` — les sparse fieldsets |

Point d'extension : `customQueryFilters()`. Override complet quand il faut un sort maison — seul
précédent : `app/Models/MaintenanceRequest.php:70-83` avec `app/Sorts/MaintenancePrioritySort.php`.

**Deux contraintes d'ordre, déjà payées et documentées dans le code :**

1. `allowedFields` **doit** être appelé avant `allowedIncludes`, sinon spatie lève
   `UnknownIncludedFieldsQuery` (`HasQueryBuilder.php:26-29`).
2. Les colonnes des relations chargeables sont préfixées du nom de table (`properties.id`), sinon
   `fields[properties]=… + include=property` lève `InvalidFieldQuery` (`HasQueryBuilder.php:49-58`).

**Adoption réelle sur 72 modèles** : `$queryFields` 35, `$requestFilterable` 35, `$requestSortable`
34, `$requestLoadable` 31, `$requestSearchFields` 15, `$requestRangeFilters` 8, `$requestCountable`
6. Un modèle neuf exposé en liste les déclare — c'est ce qui rend la règle des sparse fieldsets
tenable côté front.

> ⚠️ **Deux mécanismes de filtrage coexistent sur les mêmes modèles**, tous deux montés sur
> `AbstractModel` : le DSL maison `scopeFilter()`/`scopeWithSearch()` de `BaseModelTrait`, et spatie
> via `HasQueryBuilder`. Aucun document n'arbitre. **Pour toute surface d'API, utiliser
> `buildQuery()`** ; `scopeFilter` reste pour les usages internes (jobs, commandes, services).

## Modèles — `AbstractModel`

`app/Models/Bases/AbstractModel.php` = `Model` + `BaseModelTrait` + `HasQueryBuilder`. **67 modèles
sur 70 l'étendent.** Les trois exceptions : `User` (extends `Authenticatable`),
`ConversationParticipant` (extends `Pivot`) — et `NotificationPreference`, qui étend `Model` **sans
justification** et perd donc tout le pipeline. C'est le seul écart non documenté ; ne pas le prendre
pour un précédent.

Les enums vivent dans **`app/Models/Enums/`** (72 fichiers) — il n'existe **pas** de `app/Enums/`.

Traits partagés : `app/Models/Concerns/` en contient exactement 4 — `HasQueryBuilder`, `HasProfiles`,
`HasMediaConversions`, `HasPaymentAttributes`.

Audit : `app/Models/Bases/Auditable.php` (`LogsActivity` + `logFillable()->logOnlyDirty()`). Seuls 3
modèles le portent ; `User` redéfinit ses propres options avec une whitelist excluant password et 2FA.

## Autorisation — capacités et profils polymorphes (TCK-278)

**`spatie/laravel-permission` n'est plus installé.** Ni dans `composer.json`, ni dans
`composer.lock`. Une garde CI casse sur tout import `Spatie\Permission\`.

Trois briques :

1. **Profils** — `app/Models/Profiles/` : `OwnerProfile`, `AgentProfile`, `AgencyAdminProfile`,
   `BrokerProfile`, `ServiceProviderProfile`, `PlatformProfile` (+ 2 pivots de collaboration).
2. **Capacités** — `app/Models/Enums/Capability.php` : enum string de 44 cas `<domaine>.<verbe>` sur
   12 domaines, avec `domain()`.
3. **Résolution** — `app/Services/Membership/MembershipCapabilityResolver::allows(User, Capability,
   ?Agency): bool`. Table de vérité définie en code, **modèle additif** (OR entre profils).

L'API publique côté identité est le trait `app/Models/Concerns/HasProfiles.php` :
`hasProfileAt()`, `isOwnerAt()`, `isAgentAt()`, `isAgencyAdminAt()`, `profileTypes()` (remplace
l'ancien `getRoleNames()`), `canActAt(Capability, ?Agency)`.

**Pont de rétrocompatibilité** : `AppServiceProvider::bootGatesAndPolicies()` (ligne 415) enregistre
une `Gate::define()` par capacité — c'est ce qui fait que `$user->can('leases.terminate')` fonctionne
encore. La Gate dérive l'agence dans l'ordre : 2ᵉ argument de `can()` → `request()->activeProfile()`
→ `$user->agency_id`.

`Gate::before(… isSuperAdmin() ? true : null)` est le bypass global, enregistré une seule fois
(`AppServiceProvider.php:362`).

> ⚠️ **Des docblocks mentent encore.** `HasProfiles` se décrit comme « Sister trait of HasRoles
> (spatie) », `LeasePolicy` parle d'une « permission `leases.renew` (Spatie) », et `bootstrap/app.php`
> présente `ResolveActiveProfile` comme « sole owner of the spatie team context ». Le package n'existe
> plus. Ne pas croire ces commentaires.

> ⚠️ **`BasePolicy` est partiellement mort par construction** : ses abilities `{resource}.view` et
> `{resource}.update` ne correspondent à **aucun** cas de `Capability` (il n'existe que
> `properties.update_own`/`update_any`, et aucun `*.view`). Seules 3 policies sur 16 l'étendent.

> ⚠️ **Deux conventions d'autorisation concurrentes, sans arbitrage** : 16 policies pour 72 modèles,
> mais **38 contrôleurs redéfinissent chacun leurs `authorizeAccess()`/`authorizeManage()`** (124
> appels) avec la même logique copiée-collée. Pour du code neuf : **policy**, et l'inscrire dans
> `AppServiceProvider` si elle échappe à l'auto-discovery (11 liaisons explicites y sont nécessaires).

## Profil actif — `ResolveActiveProfile`

`app/Http/Middleware/ResolveActiveProfile.php` résout dans cet ordre : header `X-Profile-Id` ou
`?profile_id` (403 si non possédé) → header `X-Active-Profile-Hint` (ignoré si invalide) → cookie
`active_profile_id` → auto-bascule si l'utilisateur n'a de profils que dans **une** agence → rien.

Le profil est stocké dans `$request->attributes['active_profile']` et lu par la macro
`request()->activeProfile()` (`AppServiceProvider.php:260`). Le middleware est **append** sur le
groupe `api` — donc après l'authentification — et résout Sanctum manuellement pour les endpoints à
auth optionnelle.

`users.agency_id` **a été droppée** (TCK-142). `User::getAgencyIdAttribute()` est un accesseur de
compatibilité qui dérive l'agence du profil actif.

## Validation — deux conventions, et laquelle choisir

**120 `$request->validate()` inline** contre **69 classes FormRequest**. Le choix a été fait au cas
par cas et rien ne l'arbitre.

**Pour du code neuf : `FormRequest`, en étendant `app/Http/Requests/BaseFormRequest.php`**, qui
apporte deux choses qu'on ne veut pas réécrire :

- `authorize()` retourne **`false`** par défaut — *fail-closed*, chaque sous-classe doit surcharger
  (les 27 sous-classes actuelles le font toutes) ;
- `prepareForValidation()` normalise récursivement : trim de toutes les chaînes, chaîne vide → `null`.

La validation d'enum passe par `Rule::enum(XEnum::class)`. `app/Rules/` contient 4 règles
réutilisables (`PhoneRule`, `StrongPasswordRule`, `DateRangeRule`, `CurrencyRule`) — peu utilisées,
mais elles existent : ne pas en réécrire une cinquième variante inline.

## Pagination — la forme canonique

Construite à la main, **pas** via `ResourceCollection`. **Fichier exemplaire :
`app/Http/Controllers/Api/PropertyController.php:56-68`.**

```php
return $this->json([
    'data' => XResource::collection($paginator)->toArray($request),
    'meta' => [
        'total'        => $paginator->total(),
        'per_page'     => $paginator->perPage(),
        'current_page' => $paginator->currentPage(),
        'last_page'    => $paginator->lastPage(),
    ],
]);
```

Ces **quatre clés, et elles seules**. La forme est aujourd'hui dupliquée dans 44 fichiers avec des
jeux incohérents (`total` 72 fois, `current_page` 65, `last_page` 49, `per_page` 43, plus des
`links`/`from`/`to` sporadiques) — le front ne peut pas s'appuyer sur ce qui n'est pas systématique.

## Ressources — `BaseResource`

`app/Http/Resources/Bases/BaseResource.php` fournit `iso(?DateTimeInterface)`,
`enumValue(?BackedEnum)`, `enumLabel(?BackedEnum, $group, $locale)` et `mediaUrl($collection,
?$conversion)`. **Seules 7 ressources sur 44 l'étendent** ; les 36 autres étendent `JsonResource`
directement et refont ces conversions à la main. Pour du code neuf : `BaseResource`.

## Routes

`routes/api.php` fait un `glob(__DIR__.'/api/*.php')` — **43 fichiers, 1510 lignes, 535 routes**. Un
fichier par domaine métier. **Fichier exemplaire : `routes/api/properties.php:16-70`.**

Conventions : groupe `Route::middleware('auth:sanctum')` (38 occurrences), nommage systématique
`->name('domaine.action')`, et **les routes littérales se déclarent avant les paramétrées** (des
commentaires `TCK-NNN` marquent les cas où l'ordre importe).

Le namespace `/api/admin/*` est gardé par le middleware alias `super-admin`
(`app/Http/Middleware/EnsureSuperAdmin.php`) : 401 si non authentifié, 403 si non super-admin.

**Il n'y a pas de `throttle:api` global.** Le rate limiting est nommé, défini dans
`AppServiceProvider::bootRateLimiters()` (ligne 269) : `search-suggest` 60/min, `public-read` 90/min,
`public-report` 5/h, `public-visit-request` 10/h, `public-contact-lead` 5/10min, `auth-register`
10/min, `auth-password` 5/min. Le helper `visitorRateLimitKey()` résout le token Sanctum
*directement* via `PersonalAccessToken::findToken()` — parce que le throttle tourne **avant**
`ResolveActiveProfile`.

## Câblage — tout passe par `AppServiceProvider`

574 lignes, structurées en helpers privés nommés (`bootRateLimiters`, `bootObservers`,
`bootGatesAndPolicies`, `bootLeaseEventListeners`, `registerSmsServices`…). **Il n'y a pas
d'`EventServiceProvider` ni d'auto-discovery d'événements** : un listener neuf s'inscrit dans le
helper `boot*` de son domaine.

**Pattern driver/registry**, récurrent et systématique : une interface + N drivers + un binding
conditionnel par config. Instances : SMS (`SmsDriverInterface` + Orange/Mtarget/LAfricaMobile/Log +
`SmsRouterDriver`), WhatsApp (`WhatsappDriverInterface` + CloudApi/Log), CDN (`CdnProviderContract` +
Bunny/Cloudflare), Paiements (`PaymentDriverContract` + LemonSqueezy/OrangeMoney/Wave), Parsing
bancaire (`StatementParserInterface` + Csv/Ofx + factory), Intégrations (`IntegrationProvider` +
registry). Un nouveau fournisseur suit ce patron, sans exception.

## Services

148 fichiers, 33 sous-domaines. **Aucune classe de base ni interface commune** — ce sont des classes
PHP simples résolues par le container. `app/Services/Model/` (16 fichiers) est le fourre-tout
historique CRUD ; les domaines récents ont leur propre dossier (`Accounting`, `Membership`,
`Permissions`, `Privacy`, `Reporting`, `Profiles`). **Un service neuf va dans un dossier de domaine,
pas dans `Model/`.**

`app/Domain/` n'est **pas** une couche DDD : c'est un espace de catalogues définis en code
(`Settings/EditablePlatformSettings`, `Features/Flag`, `Alerts/AlertableEvents`,
`Integrations/Providers/`).

## Recherche

Seuls **3 modèles** sont `Searchable` : `Property`, `Document`, `Message`. Le driver est
`SCOUT_DRIVER` (`meilisearch` en développement docker, en CI et en production ; `collection` est un
défaut historique qui ne prouve rien — il filtre en PHP sur une collection Eloquent).

`BaseModelTrait::scopeWithSearch()` compose Scout et Eloquent par un `whereIn` sur les ids : **l'ordre
de pertinence de Scout n'est pas préservé**, et le docblock le dit (lignes 52-60). Ne pas promettre
un classement par pertinence sur ce chemin.

## Tâches planifiées

Le scheduler est **entièrement** dans `routes/console.php` (77 lignes) : 13 `Schedule::job()` et 6
`Schedule::command()`, presque tous `->withoutOverlapping()`, **chaque entrée annotée d'un commentaire
`TCK-NNN` qui explique son idempotence**. Tenir cette convention : un job planifié non idempotent est
un incident qui n'arrive qu'en production.

14 commandes maison, signature `{domaine}:{verbe-kebab}`. **Fichier exemplaire :
`app/Console/Commands/MediaCleanup.php`.**

> ⚠️ Deux préfixes plateforme concurrents coexistent : `platform:grant-super-admin` et
> `takussan:create-super-admin` font conceptuellement le même travail. Utiliser `platform:`.

## Tests

307 fichiers (277 `Feature`, 26 `Unit`). `phpunit.xml` force SQLite `:memory:`, `QUEUE_CONNECTION=sync`,
`CACHE_STORE=array`, `BCRYPT_ROUNDS=4`, `SCOUT_DRIVER=meilisearch`, `LARAVEL_PDF_DRIVER=dompdf`.

**La suite exige une instance Meilisearch** : `SCOUT_DRIVER=meilisearch` est forcé sans repli.
`./dev.sh services` la fournit.

> ⚠️ **Trois classes de base coexistent** — `tests/TestCase.php`, `tests/BaseTestCase.php`,
> `tests/ApiTestCase.php` — sans qu'aucun document ne dise laquelle choisir. Pour un test d'API,
> `ApiTestCase`.

> ⚠️ Les tests locaux écrivent dans l'index Meilisearch **réel** du développeur : `phpunit.xml` ne
> définit ni `MEILISEARCH_HOST`, ni `SCOUT_PREFIX`. Aucune isolation (dette D-08).

## Style

`./vendor/bin/pint` avant **chaque** commit. Il n'y a **pas** de `pint.json` : preset Laravel par
défaut. Rien n'impose la règle — pas de hook, pas de script — et c'est une violation d'un seul
fichier qui a bloqué toute la CI du 2026-06-29 au 2026-08-12, tests compris (Pint s'exécute *avant*
`Run tests`).

## Filament — statut ambigu

Le panel est monté sur `/admin` avec `->login()`, pour **une seule Resource** (Property, 6 fichiers),
alors que le back-office réel est en Next.js. Il n'est protégé par **aucun** middleware `super-admin`
et `User` n'implémente pas `FilamentUser`. C'est soit une dette à supprimer, soit une décision à
assumer — voir l'ardoise (D-41). **Ne pas construire dessus sans trancher.**
