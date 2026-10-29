<?php

namespace App\Models;

use App\Http\Filters\ExactIdentifierFilter;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\QueryBuilder\AllowedFilter;

/**
 * TCK-2386 (ADR-0077 §1, §9) — une annonce collectée hors du catalogue. Elle ne devient un bien que
 * sur l'accord prouvé de son annonceur (`property_id`). Les captures d'écran vivent dans la
 * collection `radar_captures`, sur le disque PRIVÉ par défaut (ADR-0029) : elles portent des
 * données personnelles et s'effacent avec l'annonce, à `purge_at`. La réserve de photos de la
 * publication (`radar_photos`, TCK-2389) est sur le même disque.
 */
class RadarListing extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia;

    protected $fillable = [
        'radar_advertiser_id', 'source_kind', 'source_site', 'source_url', 'raw_text', 'photo_urls',
        'content_fingerprint', 'extracted', 'matches', 'stage', 'stage_reason', 'extraction_attempts',
        'extracted_at', 'property_id', 'captured_by', 'purge_at',
        'source_photo_hashes', 'duplicate_of_listing_id', 'duplicate_of_property_id', 'photo_preparation',
    ];

    protected $casts = [
        'stage' => RadarListingStage::class,
        'source_kind' => RadarSourceKind::class,
        'source_site' => RadarSourceSite::class,
        'extracted' => 'array',
        'photo_urls' => 'array',
        'matches' => 'array',
        'source_photo_hashes' => 'array',
        'photo_preparation' => 'array',
        'duplicate_of_listing_id' => 'integer',
        'duplicate_of_property_id' => 'integer',
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
        'extracted_at', 'property_id', 'captured_by', 'purge_at', 'source_photo_hashes', 'duplicate_of_listing_id',
        'duplicate_of_property_id', 'photo_preparation', 'created_at', 'updated_at',
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
        // TCK-2389 — la réserve de photos de la publication : lues après l'accord ou déposées, réencodées.
        $this->addMediaCollection('radar_photos');
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

    /** TCK-2388 — les messages de démarchage qui couvrent cette annonce. */
    public function outreaches(): BelongsToMany
    {
        return $this->belongsToMany(RadarOutreach::class, 'radar_outreach_listing');
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    /** TCK-2387 — l'annonce collectée dont celle-ci est le doublon. */
    public function duplicateOfListing(): BelongsTo
    {
        return $this->belongsTo(self::class, 'duplicate_of_listing_id');
    }

    /** TCK-2387 — le bien du catalogue dont cette annonce est le doublon. */
    public function duplicateOfProperty(): BelongsTo
    {
        return $this->belongsTo(Property::class, 'duplicate_of_property_id');
    }

    /**
     * TCK-2387 — le calcul des empreintes des photos source a-t-il lieu d'être : une annonce-URL lue
     * (`extracted` ou `reviewed`). Le job la teste, et tout ce qui le met en file : un job refusé rend
     * son verrou d'unicité sans rien écrire, et chaque ouverture de la fiche en remettrait un autre.
     */
    public function fingerprintable(): bool
    {
        return $this->source_kind === RadarSourceKind::Url
            && in_array($this->stage, [RadarListingStage::Extracted, RadarListingStage::Reviewed], true);
    }

    /**
     * TCK-2387 — où en est le calcul des empreintes des photos source. `none` : rien à calculer (pas une
     * URL, ou pas de photo), ou rien qui se calculera jamais (voir ci-dessous) ; `pending` : une URL de
     * moins que prévu a été tentée (`null` : jamais calculé) ; `done` : toutes tentées, réussies ou non.
     * Le total est borné par `max_per_listing`.
     *
     * Un compte incomplet n'est `pending` que si le travail peut encore se faire : une annonce `captured`
     * (l'extraction, qui le met en file, n'a pas fini) ou une annonce lue ({@see fingerprintable()}).
     * Échec d'extraction, STOP, écart, doublon, démarchage : plus personne n'achèvera le compte, et `pending`
     * ferait rappeler la route des rapprochements toutes les 10 s (le matcher à chaque fois) sous un compteur
     * qui promet un travail qui n'aura pas lieu. Un compte COMPLET reste `done`, quelle que soit l'étape.
     *
     * @return array{status: 'none'|'pending'|'done', total: int, done: int}
     */
    public function photoFingerprintStatus(): array
    {
        if ($this->source_kind !== RadarSourceKind::Url || ($this->photo_urls ?? []) === []) {
            return ['status' => 'none', 'total' => 0, 'done' => 0];
        }
        $total = min(count($this->photo_urls), (int) config('radar.photos.max_per_listing'));
        $done = count($this->source_photo_hashes ?? []);

        if ($done < $total && $this->stage !== RadarListingStage::Captured && ! $this->fingerprintable()) {
            return ['status' => 'none', 'total' => 0, 'done' => 0];
        }

        return ['status' => $done >= $total ? 'done' : 'pending', 'total' => $total, 'done' => min($done, $total)];
    }

    /**
     * TCK-2389 — la préparation de la réserve de photos a-t-elle lieu d'être : une annonce-URL dont l'accord
     * est confirmé (`consented`). Le job la teste, et tout ce qui le met en file.
     */
    public function photoPreparable(): bool
    {
        return $this->source_kind === RadarSourceKind::Url && $this->stage === RadarListingStage::Consented;
    }

    /**
     * TCK-2389 — les URL de photo à tenter : celles de `photo_urls`, sans doublon, les
     * `radar.photos.max_per_listing` premières. Le total de {@see photoPreparationStatus()} et ce que le job lit.
     *
     * @return list<string>
     */
    public function preparableUrls(): array
    {
        $urls = array_values(array_unique(array_filter((array) ($this->photo_urls ?? []), 'is_string')));

        return array_slice($urls, 0, (int) config('radar.photos.max_per_listing'));
    }

    /**
     * TCK-2389 — les éléments de `photo_preparation` dans l'ordre de {@see preparableUrls()} (celui de `photo_urls`, la première
     * photo de la source en tête), à chaque écriture : une URL retentée après une relance reprend sa place. Un élément dont
     * l'URL n'y est plus passe en dernier, dans son ordre d'arrivée.
     *
     * @param  list<array<string, mixed>>  $elements
     * @return list<array<string, mixed>>
     */
    public function inSourceOrder(array $elements): array
    {
        $rank = array_flip($this->preparableUrls());
        $indexed = array_map(null, array_keys($elements), $elements);
        usort($indexed, fn (array $a, array $b) => [$rank[$a[1]['url'] ?? null] ?? PHP_INT_MAX, $a[0]] <=> [$rank[$b[1]['url'] ?? null] ?? PHP_INT_MAX, $b[0]]);

        return array_values(array_column($indexed, 1));
    }

    /**
     * TCK-2389 — où en est la préparation de la réserve. `none` : rien à préparer (pas une URL, pas de photo), ou
     * rien qui se préparera (l'annonce n'est pas — ou plus — `consented` et le compte est incomplet) ; `pending` :
     * annonce `consented` et il reste des URL à tenter ; `done` : toutes tentées, réussies ou non. Un compte COMPLET
     * reste `done`, quelle que soit l'étape. Seules comptent les URL encore dans {@see preparableUrls()}.
     *
     * @return array{status: 'none'|'pending'|'done', total: int, done: int}
     */
    public function photoPreparationStatus(): array
    {
        $urls = $this->preparableUrls();
        if ($this->source_kind !== RadarSourceKind::Url || $urls === []) {
            return ['status' => 'none', 'total' => 0, 'done' => 0];
        }
        $total = count($urls);
        $done = count(array_intersect($urls, array_column((array) ($this->photo_preparation ?? []), 'url')));

        if ($done < $total && ! $this->photoPreparable()) {
            return ['status' => 'none', 'total' => 0, 'done' => 0];
        }

        return ['status' => $done >= $total ? 'done' : 'pending', 'total' => $total, 'done' => $done];
    }
}
