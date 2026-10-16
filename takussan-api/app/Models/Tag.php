<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Sorts\TagUsageSort;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Spatie\QueryBuilder\AllowedSort;
use Spatie\QueryBuilder\QueryBuilder;

class Tag extends AbstractModel
{
    use HasFactory;

    protected $fillable = ['name', 'slug', 'type', 'icon', 'color', 'description', 'status', 'created_by_id'];

    /** TCK-633 — le défaut de la colonne, lisible avant la relecture de la ligne. */
    protected $attributes = [
        'status' => 'approved',
    ];

    protected $casts = [
        'type' => TagType::class,
        'status' => ReferentialStatus::class,
    ];

    protected static array $requestFilterable = ['type', 'status'];

    protected static array $requestSortable = ['id', 'name', 'type', 'created_at'];

    protected static array $requestSearchFields = ['name'];

    protected static array $queryFields = ['id', 'name', 'slug', 'type', 'icon', 'color', 'description', 'status', 'created_by_id', 'created_at', 'updated_at'];

    /**
     * TCK-712 (P02.05) — les tris déclarés, plus `usage_count`, qui se calcule pour l'agence de
     * l'appelant (`App\Sorts\TagUsageSort`) : `fetchCrmTags` le demande pour ordonner les
     * suggestions CRM, et il rendait 400.
     *
     * @param  Builder<static>|null  $baseQuery
     */
    public static function buildQuery(?Builder $baseQuery = null, ?Request $request = null, ?int $agencyId = null): QueryBuilder
    {
        return QueryBuilder::for($baseQuery ?? static::class, $request)
            ->allowedFilters(...static::getAllowedQueryFilters())
            ->allowedFields(...static::getAllAllowedQueryFields())
            ->allowedSorts(...static::$requestSortable, ...[AllowedSort::custom('usage_count', new TagUsageSort($agencyId))])
            ->allowedIncludes(...static::getAllowedQueryIncludes());
    }

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->slug)) {
                $m->slug = Str::slug($m->name);
            }
        });
    }

    public function properties(): MorphToMany
    {
        return $this->morphedByMany(Property::class, 'taggable');
    }

    public function customers(): MorphToMany
    {
        return $this->morphedByMany(Customer::class, 'taggable');
    }

    /** TCK-633 — l'auteur d'une proposition d'équipement. */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    /**
     * TCK-666 (P03.03) — une étiquette CRM ne se lit que depuis l'agence du PERSONNEL dont un
     * client la porte ; les autres types ne sont pas touchés. Le prédicat est `staffAgencyId()` et
     * non `agency_id`, qui est aussi celui d'un bailleur (TCK-587). La console voit tout.
     */
    public function scopeSansCrmHorsDeSonAgence(Builder $query, ?User $appelant): void
    {
        if ($appelant?->isSuperAdmin()) {
            return;
        }

        $agenceDuPersonnel = $appelant?->staffAgencyId();

        $query->where(function (Builder $q) use ($agenceDuPersonnel) {
            $q->whereNull('tags.type')->orWhere('tags.type', '!=', TagType::Crm->value);
            if ($agenceDuPersonnel !== null) {
                $q->orWhereHas('customers', fn (Builder $c) => $c->where('customers.agency_id', $agenceDuPersonnel));
            }
        });
    }

    /**
     * TCK-633 (ADR-0062 §7, D9) — les étiquettes d'un bien qu'une fiche PUBLIQUE montre : les
     * approuvées, et une proposition en attente là seulement où son AUTEUR l'a rattachée. Le nom
     * étant unique, un tiers qui tape le nom d'une proposition retombe sur la même ligne : elle est
     * rattachée à son bien, mais n'y sort qu'après approbation.
     *
     * ⚠ Ne s'emploie QUE sur la relation `Property::tags()` (elle lit la table de liaison).
     */
    public function scopeVisiblesSurUneFiche(Builder $query): void
    {
        $query->where(fn (Builder $q) => $q
            ->where('tags.status', ReferentialStatus::Approved->value)
            ->orWhere(fn (Builder $q) => $q
                ->where('tags.status', ReferentialStatus::Pending->value)
                ->whereColumn('taggables.attached_by_id', 'tags.created_by_id')));
    }
}
