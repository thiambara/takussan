<?php

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Property;
use App\Models\User;

return [

    /*
    |--------------------------------------------------------------------------
    | Default Search Engine
    |--------------------------------------------------------------------------
    |
    | This option controls the default search connection that gets used while
    | using Laravel Scout. This connection is used when syncing all models
    | to the search service. You should adjust this based on your needs.
    |
    | Supported: "algolia", "meilisearch", "typesense",
    |            "database", "collection", "null"
    |
    */

    'driver' => env('SCOUT_DRIVER', 'collection'),

    /*
    |--------------------------------------------------------------------------
    | Index Prefix
    |--------------------------------------------------------------------------
    |
    | Here you may specify a prefix that will be applied to all search index
    | names used by Scout. This prefix may be useful if you have multiple
    | "tenants" or applications sharing the same search infrastructure.
    |
    */

    'prefix' => env('SCOUT_PREFIX', ''),

    /*
    |--------------------------------------------------------------------------
    | Queue Data Syncing
    |--------------------------------------------------------------------------
    |
    | This option allows you to control if the operations that sync your data
    | with your search engines are queued. When this is set to "true" then
    | all automatic data syncing will get queued for better performance.
    |
    */

    'queue' => env('SCOUT_QUEUE', false),

    /*
    |--------------------------------------------------------------------------
    | Database Transactions
    |--------------------------------------------------------------------------
    |
    | This configuration option determines if your data will only be synced
    | with your search indexes after every open database transaction has
    | been committed, thus preventing any discarded data from syncing.
    |
    */

    'after_commit' => env('SCOUT_AFTER_COMMIT', false),

    /*
    |--------------------------------------------------------------------------
    | Chunk Sizes
    |--------------------------------------------------------------------------
    |
    | These options allow you to control the maximum chunk size when you are
    | mass importing data into the search engine. This allows you to fine
    | tune each of these chunk sizes based on the power of the servers.
    |
    */

    'chunk' => [
        'searchable' => 500,
        'unsearchable' => 500,
    ],

    /*
    |--------------------------------------------------------------------------
    | Soft Deletes
    |--------------------------------------------------------------------------
    |
    | This option allows to control whether to keep soft deleted records in
    | the search indexes. Maintaining soft deleted records can be useful
    | if your application still needs to search for the records later.
    |
    */

    'soft_delete' => false,

    /*
    |--------------------------------------------------------------------------
    | Identify User
    |--------------------------------------------------------------------------
    |
    | This option allows you to control whether to notify the search engine
    | of the user performing the search. This is sometimes useful if the
    | engine supports any analytics based on this application's users.
    |
    | Supported engines: "algolia"
    |
    */

    'identify' => env('SCOUT_IDENTIFY', false),

    /*
    |--------------------------------------------------------------------------
    | Algolia Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your Algolia settings. Algolia is a cloud hosted
    | search engine which works great with Scout out of the box. Just plug
    | in your application ID and admin API key to get started searching.
    |
    */

    'algolia' => [
        'id' => env('ALGOLIA_APP_ID', ''),
        'secret' => env('ALGOLIA_SECRET', ''),
        'index-settings' => [
            // 'users' => [
            //     'searchableAttributes' => ['id', 'name', 'email'],
            //     'attributesForFaceting'=> ['filterOnly(email)'],
            // ],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Meilisearch Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your Meilisearch settings. Meilisearch is an open
    | source search engine with minimal configuration. Below, you can state
    | the host and key information for your own Meilisearch installation.
    |
    | See: https://www.meilisearch.com/docs/learn/configuration/instance_options#all-instance-options
    |
    */

    'meilisearch' => [
        'host' => env('MEILISEARCH_HOST', 'http://localhost:7700'),
        'key' => env('MEILISEARCH_KEY'),
        'index-settings' => [
            Property::class => [
                // ⚠ L'ORDRE de `searchableAttributes` EST une règle de classement
                // (règle `attribute` ci-dessous) : le champ le plus discriminant
                // d'abord. C'est pourquoi les deux champs de vocabulaire ajoutés
                // par TCK-335 sont EN DERNIER, et c'est MESURÉ, pas déduit —
                // `contract_label` placé en tête fait passer n'importe quel bien
                // en location AU-DESSUS du bien dont le titre dit littéralement
                // « location » (score `attribute` 0,987 contre 0,831). Un mot
                // d'intention doit ÉLARGIR le rappel, jamais réordonner la
                // pertinence : il vaut pour 204 biens à la fois, il n'a donc
                // aucun pouvoir discriminant.
                //
                // `tags` rejoint la liste (il n'était que `filterable`) : sans
                // lui, aucun mot d'équipement — « piscine », « climatisation »,
                // « ascenseur » — ne pouvait atteindre l'index autrement qu'en
                // traînant dans une description.
                'searchableAttributes' => [
                    'title', 'type_label', 'description',
                    'neighborhood', 'city', 'tags', 'reference_number',
                    'contract_label', 'furnished_label',
                ],
                'filterableAttributes' => [
                    'type', 'contract_type', 'rent_period', 'status', 'visibility',
                    'price', 'bedrooms', 'bathrooms', 'area', 'furnished',
                    'floor_number', 'featured', 'is_test', 'agency_id', 'user_id',
                    'available_from', 'published_at', 'city', 'neighborhood',
                    'tags', '_geo',
                ],
                // TCK-346 / ADR-0023 — `_geo` est ici EN PLUS de `filterableAttributes`
                // ci-dessus : filtrer par rayon et TRIER par distance sont deux
                // autorisations distinctes.
                //
                // ⚠ Le jeton est `_geo`, PAS `_geoPoint`. La prescription du
                // ticket disait `_geoPoint` ; MESURÉ sur Meilisearch 1.16 le
                // 2026-08-22, sur un index témoin, c'est faux : avec
                // `sortableAttributes: ["_geoPoint"]`, une requête
                // `sort=_geoPoint(14.7,-17.45):asc` est REFUSÉE par
                //   « Attribute `_geo` is not sortable. Available sortable
                //     attributes are: `_geoPoint, id`. »
                // — le moteur résout l'expression de tri vers l'attribut `_geo`
                // et vérifie CELUI-LÀ. Avec `["_geo"]`, la même requête rend
                // `[1, 2, 3]`, et `[3, 2, 1]` depuis un point au nord.
                //
                // Sans ce réglage, `sort=distance` produit une erreur moteur
                // (`invalid_search_sort`, HTTP 400 → 500 côté API), pas un tri
                // dégradé : c'est un prérequis DUR, et il exige un
                // `scout:sync-index-settings` au déploiement.
                'sortableAttributes' => ['price', 'created_at', 'published_at', 'featured', '_geo'],
                'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
                // TCK-335 — mots vides français. Meilisearch les retire À LA
                // REQUÊTE comme à l'indexation : c'est ce qui fait que
                // `q=à vendre` cesse de rendre le catalogue entier. Mesuré le
                // 2026-08-21, avant : `q=a vendre` → **247** biens sur 258, le
                // « a » matchant presque tout titre français (« Studio à
                // Mermoz »). La règle `words` de Meilisearch n'exclut pas les
                // documents qui ne portent qu'un terme sur deux, elle les
                // classe plus bas — le bruit compte donc dans `meta.total`.
                //
                // Liste courte et fermée, uniquement des mots-outils : aucun
                // n'est un nom de quartier, de ville ni de type de bien
                // (« Point E », « Ouest Foire », « Sicap Baobab », « Louga »,
                // « Touba » restent intacts).
                'stopWords' => [
                    'a', 'à', 'au', 'aux', 'de', 'des', 'du',
                    'le', 'la', 'les', 'un', 'une',
                    'en', 'pour', 'avec', 'sur', 'dans',
                ],
            ],
            Message::class => [
                'searchableAttributes' => ['body'],
                'filterableAttributes' => ['sender_id', 'conversation_id', 'created_at'],
                'sortableAttributes' => ['created_at'],
                'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
            ],
            Document::class => [
                'searchableAttributes' => ['title', 'description'],
                'filterableAttributes' => ['type', 'documentable_type', 'documentable_id', 'uploaded_by', 'created_at'],
                'sortableAttributes' => ['created_at'],
                'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
            ],
            // TCK-281 — entites internes. Le callback `filter[search]` ne fait
            // que `::search()->keys()` : aucun attribut filtrable ni triable
            // n'est necessaire cote moteur, l'isolation tenant reste entiere-
            // ment cote Eloquent (intersection `$base ∩ whereIn(ids)`).
            // L'ordre de `searchableAttributes` EST une regle de classement
            // (regle `attribute`) : le champ le plus discriminant d'abord.
            Customer::class => [
                'searchableAttributes' => ['first_name', 'last_name', 'email', 'phone'],
                'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
            ],
            MaintenanceRequest::class => [
                'searchableAttributes' => ['title', 'description'],
                'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
            ],
            Agency::class => [
                'searchableAttributes' => ['name', 'email', 'license_number'],
                'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
            ],
            User::class => [
                'searchableAttributes' => ['first_name', 'last_name', 'email', 'username', 'phone'],
                'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
            ],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Typesense Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your Typesense settings. Typesense is an open
    | source search engine using minimal configuration. Below, you will
    | state the host, key, and schema configuration for the instance.
    |
    */

    'typesense' => [
        'client-settings' => [
            'api_key' => env('TYPESENSE_API_KEY', 'xyz'),
            'nodes' => [
                [
                    'host' => env('TYPESENSE_HOST', 'localhost'),
                    'port' => env('TYPESENSE_PORT', '8108'),
                    'path' => env('TYPESENSE_PATH', ''),
                    'protocol' => env('TYPESENSE_PROTOCOL', 'http'),
                ],
            ],
            'nearest_node' => [
                'host' => env('TYPESENSE_HOST', 'localhost'),
                'port' => env('TYPESENSE_PORT', '8108'),
                'path' => env('TYPESENSE_PATH', ''),
                'protocol' => env('TYPESENSE_PROTOCOL', 'http'),
            ],
            'connection_timeout_seconds' => env('TYPESENSE_CONNECTION_TIMEOUT_SECONDS', 2),
            'healthcheck_interval_seconds' => env('TYPESENSE_HEALTHCHECK_INTERVAL_SECONDS', 30),
            'num_retries' => env('TYPESENSE_NUM_RETRIES', 3),
            'retry_interval_seconds' => env('TYPESENSE_RETRY_INTERVAL_SECONDS', 1),
        ],
        // 'max_total_results' => env('TYPESENSE_MAX_TOTAL_RESULTS', 1000),
        'model-settings' => [
            // User::class => [
            //     'collection-schema' => [
            //         'fields' => [
            //             [
            //                 'name' => 'id',
            //                 'type' => 'string',
            //             ],
            //             [
            //                 'name' => 'name',
            //                 'type' => 'string',
            //             ],
            //             [
            //                 'name' => 'created_at',
            //                 'type' => 'int64',
            //             ],
            //         ],
            //         'default_sorting_field' => 'created_at',
            //     ],
            //     'search-parameters' => [
            //         'query_by' => 'name'
            //     ],
            // ],
        ],
        'import_action' => env('TYPESENSE_IMPORT_ACTION', 'upsert'),
    ],

];
