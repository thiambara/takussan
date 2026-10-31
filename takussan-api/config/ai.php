<?php

/*
|--------------------------------------------------------------------------
| Socle IA — ADR-0076
|--------------------------------------------------------------------------
| Le SEUL fichier du code applicatif où s'écrit un identifiant de modèle
| (`scripts/check-ai-usages.mjs`). `laravel/ai` fusionne sa propre configuration par
| `mergeConfigFrom`, qui ne descend pas sous le premier niveau : `providers` ci-dessous est donc la
| liste COMPLÈTE des fournisseurs joignables, et rien d'autre ne s'y ajoute.
*/

$nombre = static fn (string $cle, float $defaut): float => is_numeric($valeur = env($cle)) ? (float) $valeur : $defaut;
$montant = static fn (string $cle, string $defaut): string => preg_match('/^\d+(\.\d+)?$/', (string) env($cle)) === 1 ? (string) env($cle) : $defaut;

return [

    'default' => 'anthropic',

    // ADR-0076 §3 — la liste FERMÉE des fournisseurs sélectionnables. `legal_name` est le nom que
    // `privacy.ts` § 4.3 doit citer (`scripts/check-ai-providers-privacy.mjs`). La clé vient de
    // l'environnement, jamais de la base ni de la console.
    'providers' => [
        'anthropic' => [
            'driver' => 'anthropic',
            'key' => env('ANTHROPIC_API_KEY'),
            'url' => env('ANTHROPIC_URL', 'https://api.anthropic.com/v1'),
            'legal_name' => 'Anthropic',
        ],
        // TCK-2423 — seulement des embeddings (`serves`). Sans clé, ou sans `training_opt_out`, rien ne part : le Radar reste sur
        // `pg_trgm`. `training_opt_out` : la déclaration que l'entraînement est refusé chez Voyage, geste que `privacy.ts` § 4.3
        // promet et que le code ne peut pas constater ; ce qui part avant reste soumis à sa licence, sans retour.
        // `input_type` : le texte d'une annonce est un document, jamais une question. `allowed_hosts` : une adresse
        // ailleurs, ou sans https, ne reçoit ni le texte ni la clé.
        'voyageai' => [
            'driver' => 'voyageai',
            'key' => env('VOYAGE_API_KEY'),
            'training_opt_out' => env('VOYAGE_TRAINING_OPT_OUT', false) === true,
            'url' => env('VOYAGE_URL', 'https://api.voyageai.com/v1'),
            'legal_name' => 'Voyage AI',
            'serves' => 'embeddings',
            'allowed_hosts' => ['api.voyageai.com'],
            'embedding_options' => ['input_type' => 'document'],
        ],
    ],

    // Repli de chaque rôle quand `ai_role_assignments` n'a pas de ligne (ADR-0076 §2), dans
    // l'ordre de bascule. Un maillon ne porte que `max_tokens` : l'API d'Anthropic refuse
    // `temperature`, `top_p` et `top_k` depuis le 2026-10-21.
    'roles' => [
        'extraction' => [
            ['provider' => 'anthropic', 'model' => 'claude-sonnet-5-5', 'max_tokens' => 8000],
            ['provider' => 'anthropic', 'model' => 'claude-haiku-5-5', 'max_tokens' => 8000],
        ],
        'redaction' => [
            ['provider' => 'anthropic', 'model' => 'claude-sonnet-5-5', 'max_tokens' => 4000],
        ],
        'raisonnement' => [
            ['provider' => 'anthropic', 'model' => 'claude-opus-5-5', 'max_tokens' => 16000],
        ],
        'vision' => [
            ['provider' => 'anthropic', 'model' => 'claude-sonnet-5-5', 'max_tokens' => 8000],
        ],
        // TCK-2423 — `max_tokens` n'a pas de sens ici : un maillon d'embeddings rend des nombres.
        'embedding' => [
            ['provider' => 'voyageai', 'model' => 'voyage-4'],
        ],
    ],

    // Tarifs publiés, en dollars US par million de tokens, relevés le 2026-10-31. Des chaînes, jamais des
    // nombres (ADR-0086) : un `float` arrondirait le coût qui en découle. Une ligne d'`ai_models`
    // l'emporte sur ces valeurs (ADR-0085 §1) ; un modèle absent des deux ne s'affecte pas depuis la
    // console, son coût ne se budgéterait pas. `cache_write` est l'écriture de 5 minutes (1,25 × l'entrée).
    'pricing' => [
        'anthropic' => [
            'claude-opus-5-5' => ['input' => '4.00', 'output' => '20.00', 'cache_read' => '0.20', 'cache_write' => '5.00'],
            'claude-sonnet-5-5' => ['input' => '2.00', 'output' => '10.00', 'cache_read' => '0.10', 'cache_write' => '2.50'],
            // Tarif jusqu'à 100 000 tokens d'entrée (0,50 / 2,50 au-delà).
            'claude-haiku-5-5' => ['input' => '0.10', 'output' => '0.50', 'cache_read' => '0.01', 'cache_write' => '0.125'],
        ],
        // TCK-2423 — https://docs.voyageai.com/docs/pricing, relevé le 2026-10-31. Seule l'entrée se paie. Les 200 millions de
        // tokens offerts ne sont pas comptés : le coût journalisé est une estimation haute tant qu'ils courent.
        'voyageai' => [
            'voyage-4-large' => ['input' => '0.12', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0'],
            'voyage-4' => ['input' => '0.06', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0'],
            'voyage-4-lite' => ['input' => '0.02', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0'],
        ],
    ],

    // Le taux n'existe que pour l'équivalent affiché (« ≈ ») : il ne décide d'aucun coût, d'aucun plafond
    // ni d'aucun blocage (ADR-0086). Même garde que ci-dessous pour une clé vide.
    'usd_to_xof' => $montant('AI_USD_TO_XOF', '600'),

    // Délai d'un appel au modèle, en secondes. Le SDK en pose 60 : trop court pour une extraction
    // longue ou un raisonnement (`SocleAgent::timeout()`, plafonné à `SocleAgent::MAX_TIMEOUT_SECONDS`).
    // `is_numeric` : la CI lit `.env.example`, où la clé est vide, et une chaîne vide ne doit pas donner 0.
    // ⚠ Il ne vaut que là où rien ne coupe avant lui : une requête web meurt à 60 s
    // (`docker/php.ini`, `max_execution_time`, horloge murale sous ZTS), et un job à son `$timeout`
    // (avec `retry_after` à 90 s sur la file `database`). Un appel qui peut dépasser 60 s part donc
    // en job, sous un `$timeout` et un `retry_after` qui le couvrent — jamais dans une requête.
    'timeout_seconds' => (int) $nombre('AI_TIMEOUT_SECONDS', 300.0),

    // En dollars, en chaîne décimale (ADR-0086), par jour civil. `null` : pas de plafond à ce niveau. Le
    // plafond d'un usage se règle dans la console (`ai_usage_settings`), à défaut celui que l'usage déclare.
    'budgets' => [
        'daily_global_usd' => $montant('AI_DAILY_BUDGET_USD', '8.33'),
        'daily_per_agency_usd' => null,
    ],

];
