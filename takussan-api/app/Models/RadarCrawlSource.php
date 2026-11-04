<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\RadarCrawlDiscovery;
use App\Models\Enums\RadarCrawlScope;
use App\Models\Enums\RadarSourceSite;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2392 (ADR-0077 §10) — un site collecté automatiquement : une ligne par adaptateur
 * (`App\Services\Radar\Crawl\RadarCrawlSources`), créée éteinte. Le porteur l'allume depuis la console ; il devient son
 * opérateur (`operator_id`), au nom duquel l'extraction des annonces trouvées est jugée. Un passage ne repart qu'une fois
 * `frequency_minutes` écoulées depuis le précédent, et lit au plus `max_pages` pages de la liste.
 *
 * TCK-2438 — `start_urls` : les pages de liste d'où part un passage, réglées dans la console et contrôlées par
 * `RadarStartUrls` ; nulle, l'URL de la configuration.
 *
 * TCK-2468 (ADR-0087 §5) — `scope` : `targeted` (le défaut) ne saisit une annonce nouvelle que si sa carte peut
 * correspondre à une cible active ; `all` saisit tout ce qui est vu ({@see RadarCrawlScope}).
 *
 * TCK-2467 (ADR-0087 §4) — `discovery` : `sitemap` ou `lists` ({@see RadarCrawlDiscovery}) ; nulle, le défaut de
 * l'adaptateur ({@see RadarCrawlDiscovery::effective()}). En `sitemap`, `start_urls` et `max_pages` ne sont pas lus.
 */
class RadarCrawlSource extends AbstractModel
{
    protected $fillable = ['site', 'enabled', 'frequency_minutes', 'max_pages', 'operator_id', 'enabled_at', 'start_urls', 'scope', 'discovery'];

    protected $casts = [
        'site' => RadarSourceSite::class,
        'scope' => RadarCrawlScope::class,
        'discovery' => RadarCrawlDiscovery::class,
        'enabled' => 'boolean',
        'frequency_minutes' => 'integer',
        'max_pages' => 'integer',
        'enabled_at' => 'datetime',
        'start_urls' => 'array',
    ];

    protected static array $requestLoadable = ['operator'];

    protected static array $queryFields = [
        'id', 'site', 'enabled', 'frequency_minutes', 'max_pages', 'operator_id', 'enabled_at', 'created_at', 'updated_at',
        'start_urls', 'scope', 'discovery',
    ];

    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_id');
    }
}
