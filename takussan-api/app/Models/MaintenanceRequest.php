<?php

namespace App\Models;

use App\Http\Middleware\EnsureAgencyWritable;
use App\Models\Bases\AbstractModel;
use App\Models\Contracts\HasAuditAgency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Services\Maintenance\ProviderEligibility;
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

class MaintenanceRequest extends AbstractModel implements HasAuditAgency, HasMedia
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
        'accepted_at', 'access_instructions',
        'quote_lines', 'quote_valid_until', 'quote_estimated_duration_days',
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
        'accepted_at' => 'datetime',
        'quote_lines' => 'array',
        'quote_valid_until' => 'date',
        'quote_estimated_duration_days' => 'integer',
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
        'scheduled_at', 'completed_at', 'accepted_at', 'quote_valid_until',
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

    /**
     * TCK-592 — LE périmètre de lecture d'une liste, aligné sur `MaintenanceRequestPolicy::view()` :
     * demandeur, bailleur du bien, personnel de l'agence du bien (agence du profil actif), prestataire
     * assigné tant qu'il est assignable (collaboration et profil actifs).
     *
     * `index` recopiait la clause `agency_id` de l'ancienne policy : un bailleur de l'agence listait
     * les interventions des autres bailleurs, et un prestataire dont la collaboration avait pris fin
     * listait encore les siennes. TCK-591 (calendrier) réutilise ce scope.
     */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $eligibility = app(ProviderEligibility::class);
        $assignableAgencyIds = $eligibility->agencyIdsWhereAssignable($user);
        $staffAgencyId = $user->staffAgencyId();

        return $query->where(function (Builder $q) use ($user, $assignableAgencyIds, $staffAgencyId): void {
            $q->where('requester_id', $user->id)
                ->orWhereHas('property', fn (Builder $p) => $p->where('user_id', $user->id))
                ->orWhere(fn (Builder $assigned) => $assigned
                    ->where('assigned_to', $user->id)
                    ->whereHas('property', fn (Builder $p) => $p->whereIn('agency_id', $assignableAgencyIds)));

            if ($staffAgencyId !== null) {
                $q->orWhereHas('property', fn (Builder $p) => $p->where('agency_id', $staffAgencyId));
            }
        });
    }

    public function registerMediaCollections(): void
    {
        // Privées (ADR-0029 §3, décision TCK-538) : l'intérieur d'un logement occupé, vu du seul
        // locataire et de l'agence. Aucun écran public ne les affiche.
        $this->addMediaCollection('photos');
        $this->addMediaCollection('completion_photos');
        $this->addMediaCollection('quotes');
        // TCK-592 (P7) — l'état constaté par le prestataire AVANT d'intervenir.
        $this->addMediaCollection('before_photos');
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

    /**
     * TCK-600 (ADR-0048 §3, verif-600 O2) — une agence suspendue ne reçoit plus de travail : le
     * prestataire ASSIGNÉ n'écrit plus sur une intervention d'un bien de cette agence. Il ne porte
     * aucun profil d'agence, et le verrou des membres ({@see EnsureAgencyWritable}) ne le voyait
     * pas : il acceptait l'intervention dont le bailleur, lui, ne pouvait plus approuver le devis.
     */
    public function lockedForProvider(User $user): bool
    {
        if ($this->assigned_to === null || (int) $this->assigned_to !== (int) $user->getKey()) {
            return false;
        }

        $agencyId = $this->property?->agency_id;

        return $agencyId !== null
            && Agency::query()->whereKey($agencyId)->where('status', AgencyStatus::Suspended)->exists();
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

    /** TCK-601 (ADR-0044 §3) — l'agence d'une activité sur cette ligne est celle du bien. */
    public function auditAgencyId(): ?int
    {
        $agencyId = $this->property()->value('agency_id');

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
