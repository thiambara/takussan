<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\GeoNeighborhoodOrigin;
use App\Models\Enums\ReferentialStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * TCK-633 (ADR-0062 §4) — un quartier, venu du jeu de données (`dataset`, approuvé d'office) ou
 * proposé par une saisie (`user`, `pending` jusqu'à la modération).
 *
 * Une proposition n'est visible que de son auteur (`visiblesPour`). Une fusion ne supprime rien :
 * la source garde son nom et pointe sa cible (`merged_into_id`), si bien que le même nom retapé
 * plus tard retombe sur la cible (`canonique()`) au lieu de recréer la proposition.
 */
class GeoNeighborhood extends AbstractModel
{
    use HasFactory;

    /** La longueur de `name` — au-delà, une saisie ne devient pas une proposition. */
    public const NOM_MAX = 120;

    /** Une chaîne de fusions plus longue est une donnée corrompue : on s'arrête. */
    private const SAUTS_MAX = 5;

    protected $fillable = [
        'geo_city_id', 'slug', 'name', 'latitude', 'longitude', 'status', 'origin', 'osm_ref',
        'created_by_id', 'merged_into_id', 'renamed_at',
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
    ];

    protected static array $requestFilterable = ['status', 'geo_city_id', 'origin'];

    protected static array $requestSortable = ['id', 'name', 'created_at'];

    protected static array $requestSearchFields = ['name'];

    protected static array $queryFields = [
        'id', 'geo_city_id', 'slug', 'name', 'latitude', 'longitude', 'status', 'origin',
        'created_by_id', 'merged_into_id', 'created_at',
    ];

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
