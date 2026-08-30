<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Sorts\MaintenancePrioritySort;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Http\Request;
use Laravel\Scout\Searchable;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\QueryBuilder\AllowedSort;
use Spatie\QueryBuilder\QueryBuilder;

class MaintenanceRequest extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia, Searchable, SoftDeletes;

    /**
     * ⚠ TCK-474 — `resolution_report` A ÉTÉ RETIRÉ d'ici, et ne doit pas y revenir sans
     * migration. Il y avait été ajouté par une passe de scaffolding (74c507bb) qui, dans
     * le MÊME commit, écrivait dans `docs/backend-gap-report.md` que le champ n'existait
     * pas — jamais aucune migration ne l'a créé. Un `$fillable` sans colonne n'est pas
     * inerte : il traverse la validation puis meurt à l'UPDATE en 500 (`SQLSTATE[42703]`),
     * et sur PostgreSQL abandonne la transaction entière au passage.
     *
     * Le rapport d'intervention passe par `resolution_notes` (colonne `text`) et la
     * collection média `completion_photos`. Voir `UpdateMaintenanceRequestRequest`, qui
     * refuse le champ explicitement plutôt que de l'avaler.
     */
    protected $fillable = [
        'property_id', 'lease_id', 'requester_id', 'assigned_to',
        'title', 'description', 'category', 'priority', 'status',
        'estimated_cost', 'actual_cost',
        'quote_amount', 'quote_currency', 'quote_submitted_at',
        'quote_decision_at', 'quote_decision_by_id', 'quote_rejection_reason',
        'scheduled_at', 'started_at', 'completed_at',
        'resolution_notes', 'metadata',
    ];

    protected $casts = [
        'category' => MaintenanceCategory::class,
        'priority' => MaintenancePriority::class,
        'status' => MaintenanceStatus::class,
        'estimated_cost' => 'decimal:2',
        'actual_cost' => 'decimal:2',
        'quote_amount' => 'decimal:2',
        'quote_submitted_at' => 'datetime',
        'quote_decision_at' => 'datetime',
        'scheduled_at' => 'datetime',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['property_id', 'lease_id', 'requester_id', 'assigned_to', 'category', 'priority', 'status'];

    protected static array $requestSortable = ['id', 'created_at', 'scheduled_at', 'priority', 'status'];

    protected static array $requestLoadable = ['property', 'lease', 'requester', 'assignee', 'quoteDecisionBy'];

    protected static array $requestSearchFields = ['title', 'description'];

    protected static array $queryFields = [
        'id', 'property_id', 'lease_id', 'requester_id', 'assigned_to',
        'title', 'category', 'priority', 'status',
        'estimated_cost', 'actual_cost', 'quote_amount', 'quote_currency',
        'quote_submitted_at', 'quote_decision_at', 'quote_decision_by_id',
        'scheduled_at', 'completed_at',
        'created_at', 'updated_at',
    ];

    public static function buildQuery(?Builder $baseQuery = null, ?Request $request = null): QueryBuilder
    {
        $subject = $baseQuery ?? static::class;

        return QueryBuilder::for($subject, $request)
            ->allowedFilters(...static::getAllowedQueryFilters())
            ->allowedSorts(
                'id',
                'created_at',
                'scheduled_at',
                'status',
                AllowedSort::custom('priority', new MaintenancePrioritySort),
            )
            ->allowedFields(...static::getAllAllowedQueryFields())
            ->allowedIncludes(...static::getAllowedQueryIncludes());
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('photos');
        $this->addMediaCollection('completion_photos');
        $this->addMediaCollection('quotes');
    }

    /**
     * TCK-281 — n'indexe que l'id et les champs de `$requestSearchFields`.
     *
     * @return array<string,mixed>
     */
    public function toSearchableArray(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
        ];
    }

    public function shouldBeSearchable(): bool
    {
        return ! $this->trashed();
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function quoteDecisionBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'quote_decision_by_id');
    }

    public function conversation(): HasOne
    {
        return $this->hasOne(Conversation::class);
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }
}
