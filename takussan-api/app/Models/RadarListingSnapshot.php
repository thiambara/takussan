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
 * **À la purge de son annonce** (`RadarPurger`, ADR-0080) : SUPPRIMÉ si elle tombe pour un STOP, une révocation ou
 * `do_not_contact` ; sinon (échéance des 90 jours) DÉTACHÉ — `radar_listing_id`, `crawl_run_id`, `title_fingerprint` et
 * `neighborhood_label` à null, dates ramenées au jour. Un instantané sans annonce est une observation de marché
 * anonyme, sans passage ni instant qui la relie à la fiche purgée.
 *
 * TCK-2393 (ADR-0083 §2) — détaché, il est le SEUL de son annonce (le dernier, étendu à toute la présence ; aucun pour le
 * doublon d'une autre annonce), et porte l'état de marché que l'observatoire lisait sur elle : `detached_gone_at`
 * (disparition constatée, au jour), `detached_in_catalog` (doublon d'un bien du catalogue) et `detached_source_site`
 * (le site seul, sans passage ni instant).
 */
class RadarListingSnapshot extends AbstractModel
{
    protected $fillable = [
        'radar_listing_id', 'crawl_run_id', 'price', 'rent_period', 'contract', 'property_type', 'surface_m2',
        'bedrooms', 'neighborhood_label', 'geo_neighborhood_id', 'city', 'title_fingerprint', 'first_seen_at',
        'last_seen_at', 'observations', 'detached_gone_at', 'detached_in_catalog', 'detached_source_site',
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
        'detached_gone_at', 'detached_in_catalog', 'detached_source_site', 'created_at', 'updated_at',
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
