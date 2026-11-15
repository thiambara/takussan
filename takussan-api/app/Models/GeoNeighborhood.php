<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\GeoNeighborhoodOrigin;
use App\Models\Enums\ReferentialStatus;
use App\Sorts\CollatedNameSort;
use App\Support\Query\DepartageQueryBuilder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Spatie\Image\Enums\Fit;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Spatie\QueryBuilder\AllowedSort;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * TCK-633 (ADR-0062 §4) — un quartier, venu du jeu de données (`dataset`, approuvé d'office) ou
 * proposé par une saisie (`user`, `pending` jusqu'à la modération).
 *
 * Une proposition n'est visible que de son auteur (`visiblesPour`). Une fusion ne supprime rien :
 * la source garde son nom et pointe sa cible (`merged_into_id`), si bien que le même nom retapé
 * plus tard retombe sur la cible (`canonique()`) au lieu de recréer la proposition.
 */
class GeoNeighborhood extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia;

    /** TCK-2844 (ADR-0109 §1) — les types d'image admis pour la photo, à l'envoi comme à l'import. */
    public const COVER_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

    /** TCK-2844 — 10 Mo, à l'envoi comme au téléchargement depuis Commons. */
    public const COVER_MAX_KO = 10_240;

    /** TCK-2844 — le grand côté de la conversion servie, jamais agrandie. */
    public const COVER_DISPLAY_MAX = 1200;

    /** La longueur de `name` — au-delà, une saisie ne devient pas une proposition. */
    public const NOM_MAX = 120;

    /** Une chaîne de fusions plus longue est une donnée corrompue : on s'arrête. */
    private const SAUTS_MAX = 5;

    protected $fillable = [
        'geo_city_id', 'slug', 'name', 'latitude', 'longitude', 'status', 'origin', 'osm_ref',
        'created_by_id', 'merged_into_id', 'renamed_at', 'former_names',
    ];

    protected $attributes = [
        'status' => 'approved',
        'origin' => 'dataset',
    ];

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
        'status' => ReferentialStatus::class,
        'origin' => GeoNeighborhoodOrigin::class,
        'renamed_at' => 'datetime',
        // TCK-1080 (P67.02) — les noms d'avant un renommage, que le filtre `location` lit encore.
        'former_names' => 'array',
    ];

    protected static array $requestFilterable = ['status', 'geo_city_id', 'origin'];

    /**
     * `name` se trie à part, en `COLLATE "und-x-icu"` (TCK-1119) : voir {@see self::buildQuery()}.
     * `addresses_count` (TCK-2844) n'est pas une colonne : c'est l'alias du `withCount('addresses')`
     * que pose la console, seule appelante de `buildQuery()` — les quartiers les plus fournis d'abord.
     */
    protected static array $requestSortable = ['id', 'created_at', 'addresses_count'];

    protected static array $requestSearchFields = ['name'];

    protected static array $queryFields = [
        'id', 'geo_city_id', 'slug', 'name', 'latitude', 'longitude', 'status', 'origin',
        'created_by_id', 'merged_into_id', 'created_at',
    ];

    /**
     * TCK-1119 (P87.03) — les tris déclarés, plus `name` en `COLLATE "und-x-icu"`, l'ordre que le
     * référentiel public donne déjà aux quartiers (`GeoReferentialController::TRI`) : les cibles de
     * fusion de la console les demandent par `sort=name`, et « Île Nord » passait après « Zone B ».
     *
     * @param  Builder<static>|null  $baseQuery
     */
    public static function buildQuery(?Builder $baseQuery = null, ?Request $request = null): QueryBuilder
    {
        return DepartageQueryBuilder::for($baseQuery ?? static::class, $request)
            ->allowedFilters(...static::getAllowedQueryFilters())
            ->allowedFields(...static::getAllAllowedQueryFields())
            ->allowedSorts(...static::$requestSortable, ...[AllowedSort::custom('name', new CollatedNameSort, 'geo_neighborhoods.name')])
            ->allowedIncludes(...static::getAllowedQueryIncludes());
    }

    public function city(): BelongsTo
    {
        return $this->belongsTo(GeoCity::class, 'geo_city_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function mergedInto(): BelongsTo
    {
        return $this->belongsTo(self::class, 'merged_into_id');
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(Address::class, 'geo_neighborhood_id');
    }

    /**
     * TCK-2844 (ADR-0109 §1) — au plus une photo, sur le disque PUBLIC (comme le logo d'agence,
     * ADR-0029 §3). La provenance (`source`, `source_url`, `author`, `license`) vit dans les
     * `custom_properties` du média et n'est jamais servie au public.
     */
    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('cover')
            ->singleFile()
            ->useDisk(config('media-library.public_disk_name'))
            ->acceptsMimeTypes(self::COVER_MIMES);
    }

    /**
     * TCK-2844 — la seule image servie : 1200 px au plus sur le grand côté (`Fit::Max`, jamais
     * d'agrandissement — `width()` agrandit, cf. `Property`), en WebP, NON différée pour que l'URL
     * soit servable dès la réponse de l'envoi.
     */
    public function registerMediaConversions(?Media $media = null): void
    {
        $this->addMediaConversion('display')
            ->fit(Fit::Max, self::COVER_DISPLAY_MAX, self::COVER_DISPLAY_MAX)
            ->format('webp')
            ->nonQueued()
            ->performOnCollections('cover');
    }

    /** TCK-2844 — l'URL de la conversion `display`, ou `null` sans photo. */
    public function getCoverUrlAttribute(): ?string
    {
        $media = $this->getFirstMedia('cover');

        return $media !== null ? $media->getUrl('display') : null;
    }

    /** La ligne qui fait foi : la cible de la dernière fusion ; `null` si elle est refusée. */
    public function canonique(): ?self
    {
        $courant = $this;
        for ($saut = 0; $saut < self::SAUTS_MAX && $courant->merged_into_id !== null; $saut++) {
            $suivant = self::query()->find($courant->merged_into_id);
            if ($suivant === null) {
                return null;
            }
            $courant = $suivant;
        }

        if ($courant->merged_into_id !== null || $courant->status === ReferentialStatus::Rejected) {
            return null;
        }

        return $courant;
    }

    /** Approuvés, plus les propositions de `$user` ; jamais un refusé ni un fusionné. */
    public function scopeVisiblesPour(Builder $query, ?User $user): Builder
    {
        return $query
            ->whereNull('merged_into_id')
            ->where(function (Builder $q) use ($user) {
                $q->where('status', ReferentialStatus::Approved->value);
                if ($user !== null) {
                    $q->orWhere(fn (Builder $q) => $q
                        ->where('status', ReferentialStatus::Pending->value)
                        ->where('created_by_id', $user->id));
                }
            });
    }

    /** Un slug libre dans la ville : `nom`, puis `nom-2`, `nom-3`… */
    public static function slugLibre(int $villeId, string $nom): string
    {
        $base = Str::limit(Str::slug($nom), 130, '') ?: 'quartier';
        $slug = $base;
        for ($n = 2; self::query()->where('geo_city_id', $villeId)->where('slug', $slug)->exists(); $n++) {
            $slug = $base.'-'.$n;
        }

        return $slug;
    }
}
