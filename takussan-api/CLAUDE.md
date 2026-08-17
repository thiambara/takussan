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

`app/Models/Bases/AbstractModel.php` = `Model` + `BaseModelTrait` + `HasQueryBuilder`. **68 modèles
sur 70 l'étendent.** Les deux exceptions sont justifiées par leur classe parente : `User` (extends
`Authenticatable`) et `ConversationParticipant` (extends `Pivot`).

Il y en avait une troisième — `NotificationPreference` étendait `Model` **sans justification**, et
perdait donc tout le pipeline. Elle a été ramenée sur `AbstractModel`. Un écart non documenté ne
reste pas un écart : le suivant le lit comme un précédent.

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

> ℹ️ **Les trois docblocks qui décrivaient encore spatie ont été corrigés** — `HasProfiles`
> (« Sister trait of HasRoles »), `LeasePolicy` (« permission `leases.renew` (Spatie) ») et
> `bootstrap/app.php` (« sole owner of the spatie team context »). Le package n'existe plus depuis
> TCK-278 ; si un commentaire le mentionne encore ailleurs, il décrit un mécanisme supprimé.

> ✅ **`BasePolicy` DÉSIGNE ses capacités, il ne les nomme plus** (TCK-297). Il concaténait
> `$this->resource().'.view'` — et trois familles de chaînes ainsi produites n'existaient dans
> aucun cas de `Capability` : `*.view` (l'enum n'en a aucun, sur aucun domaine), `properties.update`
> et `leases.update|delete` (l'enum sépare `update_any`/`update_own`), et `media.*` en entier.
> Or **une ability non définie ne lève pas, elle refuse** : ces abilities refusaient tout le monde
> sauf le super-admin, sans trace.
>
> Une policy déclare désormais `viewCapability()` / `createCapability()` / `updateCapability()` /
> `deleteCapability()`, typées `?Capability` — la faute est devenue **inexprimable**. `null` signifie
> « pas gardé par capacité », ce qui refuse : **lire n'est pas un privilège catalogué**, c'est le
> périmètre d'agence qui le porte (principe non négociable n°2).
>
> Deux gardes tiennent la propriété : `tests/Unit/Policies/BasePolicyCapabilityTest.php` (la liste
> des sous-classes est **dérivée** de `app/Policies/`, pas recopiée) et
> `tests/Unit/Authorization/CapabilityStringLiteralsTest.php`, qui tokenise `app/` et casse sur tout
> littéral de forme `<domaine>.<verbe>` passé à `can()`/`authorize()` sans cas d'enum correspondant.
> Le tokenizer n'est pas un raffinement : un `grep` sur la même recherche rend trois faux positifs
> (un docblock, un commentaire de test, un nom de route Laravel).

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

**7 modèles** sont `Searchable` : `Property`, `Document`, `Message`, et — depuis TCK-281 —
`Customer`, `MaintenanceRequest`, `Agency`, `User`. **Ne pas recopier cette liste ailleurs** : elle
se dérive du code (`Tests\Support\SearchableModels`, et `grep -rl 'use Laravel\Scout\Searchable'
app/Models`). Le driver est `SCOUT_DRIVER` (`meilisearch` en développement docker, en CI et en
production ; `collection` est un défaut historique qui ne prouve rien — il filtre en PHP sur une
collection Eloquent).

**Deux chemins composent Scout et Eloquent, et ils ne se valent PAS :**

| Chemin | Ordre de pertinence |
|---|---|
| `BaseModelTrait::scopeWithSearch()` — le DSL maison, usages internes | **perdu** (`whereIn`, docblock lignes 52-60) |
| `HasQueryBuilder` `filter[search]` — toute surface d'API | **restitué** (TCK-281) |

Sur le second chemin, le callback mémorise l'ordre des ids rendus par Meilisearch
(`HasQueryBuilder::$searchRelevanceIds`) et le contrôleur le rejoue via
`Model::defaultSortsWithRelevance('-created_at')` → `App\Sorts\SearchRelevanceSort`, un `CASE`
portable SQLite/MySQL (`FIELD()` n'existe pas en SQLite). **Le résultat se passe à `defaultSorts()`,
jamais à `allowedSorts()`** : un `sort=` explicite du client reste souverain, la pertinence n'agit
qu'à défaut.

⚠️ **Un contrôleur qui écrit `->defaultSort(…)` en dur sur un modèle `Searchable` reprend la
recherche tolérante aux fautes et jette le classement.** C'était l'état d'avant TCK-281, et il
cochait un AC sans le tenir.

⚠️ **Le cap `HasQueryBuilder::SEARCH_ID_CAP` (5000) échoue en silence** : Meilisearch rend au plus
5000 ids **globaux** *avant* l'intersection avec le scope tenant. Une correspondance de l'agence de
l'appelant classée au-delà de ce rang global disparaît sans message ni compteur tronqué.

⚠️ **Les consoles super-admin (`/api/admin/agencies`, `/api/admin/users`) n'empruntent aucun des deux
chemins** : elles écrivent leur propre `LIKE` SQL. Elles restent strictes, par choix (TCK-281,
« Hors périmètre ») — pas par oubli.

## Tâches planifiées

Le scheduler est **entièrement** dans `routes/console.php` (77 lignes) : 13 `Schedule::job()` et 6
`Schedule::command()`, presque tous `->withoutOverlapping()`, **chaque entrée annotée d'un commentaire
`TCK-NNN` qui explique son idempotence**. Tenir cette convention : un job planifié non idempotent est
un incident qui n'arrive qu'en production.

16 commandes maison, signature `{domaine}:{verbe-kebab}` — **le préfixe est un DOMAINE, jamais le
nom du produit**. `scripts/check-command-prefixes.mjs` (Repo CI) le garde. **Fichier exemplaire :
`app/Console/Commands/MediaCleanup.php`.**

> ✅ **Les deux préfixes plateforme concurrents sont soldés (TCK-309, ex-dette D-38).**
> `takussan:create-super-admin` était le seul `takussan:` sur 16 commandes — un nom de dépôt, qui ne
> partitionne rien puisque tout ce qui est ici lui appartient. Elle s'appelle désormais
> **`platform:create-super-admin`**, sous le même domaine que sa jumelle
> `platform:grant-super-admin`. Les deux ne font d'ailleurs pas le même travail : la première
> **crée** l'opérateur (user + 2FA + codes de secours), la seconde **promeut** un user existant.
>
> ⚠️ **L'ancien nom reste un alias déprécié**, et ce n'est pas de la prudence : `docs/features.md`
> §2.1 le prescrit encore à l'installation d'un environnement, et ce document ne se modifie pas
> depuis un ticket d'implémentation. *Renommer une commande qu'un document de référence prescrit,
> c'est fabriquer une panne pour le jour de l'installation — et ce jour-là, personne ne pensera à
> `git log`.* L'alias avertit à chaque invocation. Il se retire dans cet ordre : mettre
> `docs/features.md` à jour, retirer `$aliases`, puis vider `ALIAS_DEPRECIES_TOLERES` dans la garde
> — qui **rougit si l'alias disparaît sans qu'on l'y ait déclaré**.

## Tests

307 fichiers (277 `Feature`, 26 `Unit`). `phpunit.xml` force SQLite `:memory:`, `QUEUE_CONNECTION=sync`,
`CACHE_STORE=array`, `BCRYPT_ROUNDS=4`, `SCOUT_DRIVER=meilisearch`, `LARAVEL_PDF_DRIVER=dompdf`.

**La suite exige une instance Meilisearch** : `SCOUT_DRIVER=meilisearch` est forcé sans repli.
`./dev.sh services` la fournit.

### Quelle classe de base étendre — la règle, et elle est gardée (TCK-309)

**Trois bases, une par usage. Le choix se lit, il ne se devine plus.**

| Étendre | Quand | Ce que ça apporte |
|---|---|---|
| `PHPUnit\Framework\TestCase` | test **unitaire pur** : ni base, ni conteneur, ni HTTP | rien — et c'est le but : l'application ne démarre pas (10 classes) |
| `Tests\TestCase` | tout ce qui a besoin de **l'application** : modèles, services, commandes, jobs, policies | coupure Scout, `actingAsRole()`, `materializeRoleProfile()`, `assertJsonError()`, `assertJsonStructurePaginated()` (304 classes) |
| `Tests\ApiTestCase` | tout ce qui frappe une route **`/api/*`** | + `apiActingAsRole()` et les verbes `apiGet/apiPost/…`, qui authentifient par le garde **`sanctum`** (38 classes) |

⚠️ **Ne jamais étendre `Illuminate\Foundation\Testing\TestCase` en direct.** C'est
`Tests\TestCase::setUp()` qui coupe la synchronisation Scout ; l'éviter rallume l'indexation
synchrone pour ce test-là, **sans qu'il rougisse lui-même** — c'est la suite entière qui bascule,
plus tard, ailleurs (D-44). `scripts/check-test-base-classes.mjs` (Repo CI) refuse les deux fautes :
une base hors des trois, et **une quatrième classe de base**.

> **Il y en avait TROIS, mais pas celles-ci** : `TestCase` → `BaseTestCase` → `ApiTestCase`, en
> chaîne, sans qu'aucun document ne dise laquelle étendre. `BaseTestCase` n'avait **pas d'usage
> propre** — elle portait `actingAsRole()` et deux assertions JSON que rien ne réservait aux tests
> non-API. Le partage qui en résultait ne suivait donc aucune règle, seulement l'ordre d'écriture :
> 49 classes d'un côté, 38 de l'autre, la même chose des deux. Elle a été **fondue dans
> `Tests\TestCase` et supprimée**.
>
> *Deux emplacements également plausibles ne restent pas deux : le suivant lit le désordre comme un
> précédent, et la quatrième base arrive sans que personne n'ait rien décidé.* Une quatrième se
> justifie par un quatrième **usage** — et elle se déclare alors dans `BASES_CANONIQUES`, sinon la
> CI casse.

> ⚠️ Les tests visent l'instance Meilisearch **réelle** du développeur : `phpunit.xml` ne définit
> pas `MEILISEARCH_HOST`, donc c'est celui du `.env` qui sert.

### Déterminisme du harnais — ce qui a été payé, et ce qu'il ne faut pas défaire

La suite **basculait**. Lancée seule : 2056 verts. Lancée pendant qu'une autre tournait : 12 échecs,
puis 4 sur un ensemble **différent**, sans qu'un fichier n'ait changé. Un test rouge y était
indiscernable d'une régression. Quatre mécanismes, tous dans `tests/`, l'ont fermé — **les défaire
rouvre la panne, et elle ne se voit qu'au hasard du tempo** :

1. **`waitForMeilisearch()` LÈVE sur expiration.** Elle retournait normalement quand les 10 s
   s'écoulaient — sans exception, sans assertion, sans trace — et le test enchaînait sur un index à
   moitié construit. C'est la ligne qui a coûté le plus cher : *une barrière de synchronisation qui
   abandonne en silence transforme une course en test rouge aléatoire.* La logique est extraite dans
   `tests/Support/MeilisearchBarrier.php`, testable sans moteur, et son message dit combien de
   tâches restaient, sur quels index, et depuis quand.
2. **La liste des modèles indexés est DÉRIVÉE** (`tests/Support/SearchableModels.php`), plus
   recopiée. La version manuelle valait `[Property, Document]` et avait oublié `Message` : ses
   documents n'étaient jamais purgés entre deux tests.
3. **La synchronisation Scout est coupée par défaut** dans `Tests\TestCase::setUp()`, et rallumée
   par le seul `InteractsWithMeilisearch`. Avant, `SCOUT_DRIVER=meilisearch` + `SCOUT_QUEUE=false`
   faisaient qu'un `save()` de n'importe quel test poussait un document : 3308 tâches par exécution,
   dont 2628 sur l'index des biens. **Un test de recherche neuf doit porter le concern** — sans lui,
   il n'indexe plus. La suite y a gagné 45 % de durée (313 s → 173 s).
4. **Tout ce qui est partagé par machine est préfixé — mais par (EXÉCUTION, WORKER), pas par
   processus seul depuis TCK-321** (`tests/bootstrap.php`) : les index Meilisearch
   (`testing_<token>_`, cf. `TestSearchIndex`) et la racine des disques `Storage::fake()` (via
   `TEST_TOKEN`, cf. `TestFilesystemIsolation`). Le jeton est **composé**
   (`Tests\Support\TestProcessToken::value()`) : `<pid+aléa>` — le discriminant d'exécution, en tête,
   c'est lui qui survit — suffixé de `_<index worker>` quand `artisan test --parallel` tourne. Élire
   un seul des deux jetons ne suffit pas : le jeton posé par Laravel seul (`1`, `2`… `N`) redonnerait
   `public_test_1` à deux agents qui parallélisent en même temps, soit exactement la panne que D-44 a
   soldée. `TestFilesystemIsolation::install()` **ne renonce plus** quand `TEST_TOKEN` est déjà posé
   par ParaTest — il le lit et le compose, au lieu de l'ancien `return` anticipé qui portait le
   commentaire *« on ne l'écrase pas, sous peine de faire diverger la racine des disques de la base de
   données du worker »*. **C'est précisément ce `return` qu'il ne faut pas restaurer.** Les deux se
   nettoient à l'extinction du processus. `SCOUT_PREFIX` n'est **plus** déclaré dans `phpunit.xml` ni
   dans `api-ci.yml` : le réintroduire re-figerait le préfixe et re-casserait l'isolation.

   ⚠️ **Un seul agent à la fois peut lancer `--parallel`.** Deux exécutions simultanées se cassent
   au démarrage sur une **quatrième** ressource partagée par machine, dans ParaTest lui-même, que la
   composition des jetons ci-dessus ne couvre pas : l'une reste verte, l'autre meurt avant le premier
   test sur `mkdir(): File exists` (mesuré, TCK-322, ardoise D-49). `--tmp-dir` ne corrige pas.
   Le mode séquentiel et `php bin/impacted-tests.php` supportent la simultanéité entre agents ;
   `--parallel` ne la supporte pas.

## Ne lancer que les tests que le diff touche

```bash
php bin/impacted-tests.php            # affiche la sélection et la commande
php bin/impacted-tests.php --run      # l'exécute
php bin/impacted-tests.php --base=dev # + tout ce qui sépare HEAD de dev
```

**Pourquoi.** La suite ne contient aucun point chaud à optimiser ligne à ligne : il n'y a qu'à en
lancer moins pour la majorité des diffs. `tests/impact-map.json` associe à chaque fichier de `app/`
les classes de test qui l'ont réellement couvert, mesuré depuis un rapport de couverture Xdebug sur
la suite entière (le 2026-08-17 : **346 classes de test, 667 fichiers de `app/` couverts sur 796
scannés**, carte de 0,12 Mo). `ImpactSelector` la lit avec un diff (`git diff --name-only`) et
répond soit une liste de classes, soit `SUITE ENTIÈRE` avec son motif quand le fichier touché est
hors de portée de la carte — une migration, une factory, un seeder, `bootstrap/`, `config/`,
`composer.json`, `composer.lock` ou un fichier de harnais (`phpunit.xml`, `tests/bootstrap.php`,
`tests/TestCase.php`) modifient ce que **tous** les tests voient, pas seulement ceux qui les
référencent explicitement.

**Le défaut de la règle est d'ESCALADER, pas d'ignorer.** Tout chemin sous `takussan-api/` qui
n'entre dans aucune règle impose la suite entière, sauf s'il figure dans la liste explicite de
chemins inertes (`docs/`, `storage/`, `vendor/`, `node_modules/`, `public/build/`, `*.md`). C'est une
correction de la revue finale : le défaut était « ignorer », et modifier `tests/BaseTestCase.php` —
dont **89** classes héritent — ou `.env.example` — qui **est** l'environnement de test de la CI —
rendait « rien à lancer » et sortie 0. *Une sélection trop large coûte des secondes ; une sélection
trop étroite produit un vert qui ne prouve rien.*

> ⚠️ **Cette liste est recopiée à la main depuis `ImpactSelector::HARD_PREFIXES` et
> `::HARD_FILES`, et rien ne la garde.** Elle avait déjà dérivé le jour où elle a été écrite —
> `composer.json` y manquait, et c'est une revue qui l'a vu. **La source de vérité est le code** ;
> si les deux divergent, croire le code. Une garde de plus dans `scripts/check-*.mjs` reste à
> écrire (cf. TCK-320, « Suites »).

Mesuré par ablation le 2026-08-17 (un ajout de ligne vide dans
`app/Services/Search/PropertySearchService.php`, machine à `load average` 5,2-5,8 sur 8 cœurs) :
**4 classes sélectionnées, 26 tests, 16,7 s d'horloge** — contre 204-235 s pour la suite entière au
repos. Le gain vient de l'évitement, pas d'une suite plus rapide : la carte ne modifie aucun test.

**Qui lance quoi.** Un agent délégué lance les tests pertinents pour **son** travail — cette
commande, ou les classes qu'il touche. **Il ne lance jamais la suite entière** : c'est la session qui
l'a délégué qui la lance, une fois, à la fin. Le motif est mesuré et il tient en une ligne : la suite
occupe 0,73 cœur sur 8, donc N agents qui la lancent ne se partagent pas la machine, ils la saturent
(×11 entre repos et saturation). Détail : `CLAUDE.md` racine, § *« Qui lance quoi »*.

⚠ **Un vert de cette commande ne dit RIEN de la suite.** C'est une boucle de retour rapide, pas une
garde. La CI et le rituel de fin de branche continuent de jouer la suite entière. Quand la commande
répond `SUITE ENTIÈRE`, elle a raison — c'est le comportement voulu, pas un repli par prudence.

La carte (`tests/impact-map.json`) est **dérivée, jamais éditée à la main** — même règle que
`docs/backlog/INDEX.md`. `scripts/check-impact-map.mjs` garde sa cohérence structurelle (Repo CI) ;
elle se régénère avec `php bin/build-impact-map.php <rapport-de-couverture> tests/impact-map.json`
à partir d'un rapport `--coverage-php` produit par `php artisan test`.
Détail : [`docs/plans/2026-08-17-temps-d-execution-des-tests.md`](../docs/plans/2026-08-17-temps-d-execution-des-tests.md).

## Style

`./vendor/bin/pint` avant **chaque** commit. Il n'y a **pas** de `pint.json` : preset Laravel par
défaut. Rien n'impose la règle — pas de hook, pas de script — et c'est une violation d'un seul
fichier qui a bloqué toute la CI du 2026-06-29 au 2026-08-12, tests compris (Pint s'exécute *avant*
`Run tests`).

## Il n'y a pas de back-office PHP — et « admin » désigne trois choses

**Filament a été supprimé le 2026-08-15** (TCK-287, ardoise D-41) : 7 fichiers de code, 2 racines
composer, 29 paquets transitifs et 37 fichiers d'assets. Il montait un panel sur `/admin` pour une
**seule** Resource, alors que l'administration réelle vit en Next.js. Ne pas le réintroduire sans
ADR.

Le mot « admin » recouvre trois surfaces distinctes dans ce produit, et les confondre coûte cher :

| Surface | Où | Qui |
|---|---|---|
| **Admin d'agence** | front, `/admin/*` — 10 pages | le patron d'une agence, sur **son** agence |
| **Super-admin** | front, `/super-admin/*` — 26 pages | l'équipe Takussan, sur **la plateforme** |
| **`/api/admin/*`** | back, gardé par le middleware alias `super-admin` | l'API qui sert la console super-admin |

Le disparu s'appelait `/admin` **sur le domaine de l'API** — d'où la confusion. Il n'en reste rien.
