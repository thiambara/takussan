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
        // Aucun fournisseur retenu ne sert d'embeddings : le premier usager (TCK-2392 ou TCK-344)
        // en ajoute un, avec sa ligne de `privacy.ts`.
        'embedding' => [],
    ],

    // Tarifs publiés, en dollars US par million de tokens, relevés le 2026-10-27. Un modèle absent
    // d'ici ne s'affecte pas depuis la console : son coût ne se budgéterait pas. `cache_write` est
    // l'écriture de 5 minutes (1,25 × l'entrée).
    'pricing' => [
        'anthropic' => [
            'claude-opus-5-5' => ['input' => 4.00, 'output' => 20.00, 'cache_read' => 0.20, 'cache_write' => 5.00],
            'claude-sonnet-5-5' => ['input' => 2.00, 'output' => 10.00, 'cache_read' => 0.20, 'cache_write' => 2.50],
            // Tarif jusqu'à 100 000 tokens d'entrée (0,50 / 2,50 au-delà). Lecture en cache : la règle
            // générale (0,1 × l'entrée), non publiée pour ce modèle à la date du relevé.
            'claude-haiku-5-5' => ['input' => 0.10, 'output' => 0.50, 'cache_read' => 0.01, 'cache_write' => 0.125],
        ],
    ],

    // Conversion figée sur chaque ligne de `ai_calls` au moment de l'appel. `is_numeric` : la CI lit
    // `.env.example`, où la clé est vide, et une chaîne vide ne doit pas donner un taux nul.
    'usd_to_xof' => $nombre('AI_USD_TO_XOF', 600.0),

    // Délai d'un appel au modèle, en secondes. Le SDK en pose 60 : trop court pour une extraction
    // longue ou un raisonnement (`SocleAgent::timeout()`, plafonné à `SocleAgent::MAX_TIMEOUT_SECONDS`).
    // Même garde numérique que ci-dessus.
    // ⚠ Il ne vaut que là où rien ne coupe avant lui : une requête web meurt à 60 s
    // (`docker/php.ini`, `max_execution_time`, horloge murale sous ZTS), et un job à son `$timeout`
    // (avec `retry_after` à 90 s sur la file `database`). Un appel qui peut dépasser 60 s part donc
    // en job, sous un `$timeout` et un `retry_after` qui le couvrent — jamais dans une requête.
    'timeout_seconds' => (int) $nombre('AI_TIMEOUT_SECONDS', 300.0),

    // En XOF, par jour civil. `null` : pas de plafond à ce niveau. Le plafond d'un usage se règle
    // dans la console (`ai_usage_settings`), à défaut celui que l'usage déclare.
    'budgets' => [
        'daily_global_xof' => $nombre('AI_DAILY_BUDGET_XOF', 5000.0),
        'daily_per_agency_xof' => null,
    ],

];
