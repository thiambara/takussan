<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;

/**
 * TCK-2472 (ADR-0088 §1) — une recherche publique, un jour : compteurs anonymes et agrégés, rien par personne.
 * Écrit par `App\Services\Search\SearchJournal` (jamais par ce modèle : écriture concurrente par `upsert`), purgé à
 * 13 mois par `search:purge-journal`.
 */
class SearchQueryStat extends AbstractModel
{
    protected $fillable = [
        'day', 'query_key', 'normalized_query', 'criteria',
        'searches_count', 'distinct_visitors', 'distinct_networks', 'zero_results_count', 'last_results_count',
    ];

    protected $casts = [
        'day' => 'date',
        'criteria' => 'array',
        'searches_count' => 'integer',
        'distinct_visitors' => 'integer',
        'distinct_networks' => 'integer',
        'zero_results_count' => 'integer',
        'last_results_count' => 'integer',
    ];
}
