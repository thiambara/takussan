<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2392 — un état observé d'une annonce collectée, valable de `first_seen_at` à `last_seen_at` sur `observations`
 * passages. Écrit par `App\Services\Radar\Crawl\RadarSnapshots`, lu par l'observatoire du marché (TCK-2393). Le détail de
 * chaque colonne est dans la migration `2026_10_30_392100_create_radar_listing_snapshots_table`.
 *
 * `price` est en XOF ; `title_fingerprint` est une empreinte, jamais le texte (ADR-0077 §9).
 *
 * **Détaché à la purge** de son annonce (`RadarPurger`, ADR-0080) : `radar_listing_id`, `title_fingerprint` et
 * `neighborhood_label` passent à null. Un instantané sans annonce est une observation de marché anonyme.
 *
 * TCK-2393 (ADR-0083 §2) — la purge n'en laisse qu'UN par annonce (le dernier, étendu à toute la présence), aucun pour le
 * doublon d'une autre annonce, et y recopie l'état de marché que l'observatoire lisait sur l'annonce :
 * `detached_gone_at` (disparition constatée) et `detached_in_catalog` (doublon d'un bien du catalogue).
 */
class RadarListingSnapshot extends AbstractModel
{
    protected $fillable = [
        'radar_listing_id', 'crawl_run_id', 'price', 'rent_period', 'contract', 'property_type', 'surface_m2',
        'bedrooms', 'neighborhood_label', 'geo_neighborhood_id', 'city', 'title_fingerprint', 'first_seen_at',
        'last_seen_at', 'observations', 'detached_gone_at', 'detached_in_catalog',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'surface_m2' => 'decimal:2',
        'bedrooms' => 'integer',
        'geo_neighborhood_id' => 'integer',
        'observations' => 'integer',
        'first_seen_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'detached_gone_at' => 'datetime',
        'detached_in_catalog' => 'boolean',
    ];

    protected static array $queryFields = [
        'id', 'radar_listing_id', 'crawl_run_id', 'price', 'rent_period', 'contract', 'property_type', 'surface_m2',
        'bedrooms', 'neighborhood_label', 'geo_neighborhood_id', 'city', 'first_seen_at', 'last_seen_at', 'observations',
        'detached_gone_at', 'detached_in_catalog', 'created_at', 'updated_at',
    ];

    public function listing(): BelongsTo
    {
        return $this->belongsTo(RadarListing::class, 'radar_listing_id');
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(RadarCrawlRun::class, 'crawl_run_id');
    }
}
