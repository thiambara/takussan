<?php

namespace App\Models;

use App\Http\Filters\ExactIdentifierFilter;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\QueryBuilder\AllowedFilter;

/**
 * TCK-2386 (ADR-0077 §1, §9) — une annonce collectée hors du catalogue. Elle ne devient un bien que
 * sur l'accord prouvé de son annonceur (`property_id`). Les captures d'écran vivent dans la
 * collection `radar_captures`, sur le disque PRIVÉ par défaut (ADR-0029) : elles portent des
 * données personnelles et s'effacent avec l'annonce, à `purge_at`.
 */
class RadarListing extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia;

    protected $fillable = [
        'radar_advertiser_id', 'source_kind', 'source_site', 'source_url', 'raw_text', 'photo_urls',
        'content_fingerprint', 'extracted', 'matches', 'stage', 'stage_reason', 'extraction_attempts',
        'extracted_at', 'property_id', 'captured_by', 'purge_at',
    ];

    protected $casts = [
        'stage' => RadarListingStage::class,
        'source_kind' => RadarSourceKind::class,
        'source_site' => RadarSourceSite::class,
        'extracted' => 'array',
        'photo_urls' => 'array',
        'matches' => 'array',
        'extraction_attempts' => 'integer',
        'extracted_at' => 'datetime',
        'purge_at' => 'datetime',
    ];

    protected static array $requestFilterable = ['stage', 'source_site', 'radar_advertiser_id'];

    protected static array $requestSortable = ['created_at', 'stage'];

    // `raw_text` est lisible : la fiche de l'opérateur en a besoin. La liste du front ne le demande simplement pas.
    protected static array $queryFields = [
        'id', 'radar_advertiser_id', 'source_kind', 'source_site', 'source_url', 'raw_text', 'photo_urls',
        'content_fingerprint', 'extracted', 'matches', 'stage', 'stage_reason', 'extraction_attempts',
        'extracted_at', 'property_id', 'captured_by', 'purge_at', 'created_at', 'updated_at',
    ];

    // Seul l'annonceur se charge par `include=` : la ressource ne rend que lui. Sous un sparse
    // fieldset, `fields[radar_listings]` doit alors lire `radar_advertiser_id`, sinon la relation
    // se résout à null.
    protected static array $requestLoadable = ['advertiser'];

    /** `filter[advertiser_id]` : le nom que lit la console, alias de la colonne `radar_advertiser_id`. */
    protected static function customQueryFilters(): array
    {
        return [AllowedFilter::custom('advertiser_id', new ExactIdentifierFilter, 'radar_advertiser_id')];
    }

    /** ADR-0077 §9 — posé à la création : collecte + 90 jours, sauf date explicite. */
    protected static function booted(): void
    {
        static::creating(function (self $listing): void {
            $listing->purge_at ??= now()->addDays((int) config('radar.purge_after_days', 90));
        });
    }

    public function registerMediaCollections(): void
    {
        // Aucun `useDisk()` : la collection tombe sur le disque par défaut, PRIVÉ (ADR-0029 §3).
        $this->addMediaCollection('radar_captures');
    }

    public function advertiser(): BelongsTo
    {
        return $this->belongsTo(RadarAdvertiser::class, 'radar_advertiser_id');
    }

    /** Nommée `capturer` et non `capturedBy` : la colonne `captured_by` ferait écraser l'identifiant à la sérialisation. */
    public function capturer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'captured_by');
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }
}
