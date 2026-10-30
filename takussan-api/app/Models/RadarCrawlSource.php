<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\RadarSourceSite;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2392 (ADR-0077 §10) — un site collecté automatiquement : une ligne par adaptateur
 * (`App\Services\Radar\Crawl\RadarCrawlSources`), créée éteinte. Le porteur l'allume depuis la console ; il devient son
 * opérateur (`operator_id`), au nom duquel l'extraction des annonces trouvées est jugée. Un passage ne repart qu'une fois
 * `frequency_minutes` écoulées depuis le précédent, et lit au plus `max_pages` pages de la liste.
 */
class RadarCrawlSource extends AbstractModel
{
    protected $fillable = ['site', 'enabled', 'frequency_minutes', 'max_pages', 'operator_id', 'enabled_at'];

    protected $casts = [
        'site' => RadarSourceSite::class,
        'enabled' => 'boolean',
        'frequency_minutes' => 'integer',
        'max_pages' => 'integer',
        'enabled_at' => 'datetime',
    ];

    protected static array $requestLoadable = ['operator'];

    protected static array $queryFields = [
        'id', 'site', 'enabled', 'frequency_minutes', 'max_pages', 'operator_id', 'enabled_at', 'created_at', 'updated_at',
    ];

    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_id');
    }
}
