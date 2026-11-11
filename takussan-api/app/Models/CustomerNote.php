<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Contracts\HasAuditAgency;
use App\Models\Enums\CustomerNoteKind;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\Support\LogOptions;

class CustomerNote extends AbstractModel implements HasAuditAgency
{
    use Auditable, HasFactory, SoftDeletes;

    /** TCK-2578 — `property_visit_id` : la visite que cite une note `visit_report` (une par visite). */
    protected $fillable = ['customer_id', 'author_id', 'body', 'pinned', 'kind', 'property_visit_id'];

    protected $casts = [
        'pinned' => 'boolean',
        'kind' => CustomerNoteKind::class,
    ];

    /**
     * TCK-591 — la note entre au journal (« note ajoutée ») sans son corps : le journal de la fiche
     * dit qu'une chose a eu lieu, pas ce qu'elle contient.
     */
    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['customer_id', 'author_id', 'pinned', 'kind'])
            ->logOnlyDirty()
            ->dontLogEmptyChanges()
            ->useLogName(class_basename(static::class));
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function visit(): BelongsTo
    {
        return $this->belongsTo(PropertyVisit::class, 'property_visit_id');
    }

    /**
     * TCK-2578 (ADR-0101 § 2) — le compte rendu de visite est lu par le seul personnel de l'agence :
     * sans ce droit, les notes `visit_report` sortent de la lecture ; les notes sans nature restent.
     */
    public function scopeWithoutVisitReports(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->whereNull('kind')
            ->orWhere('kind', '!=', CustomerNoteKind::VisitReport->value));
    }

    /** TCK-601 (ADR-0044 §3) — l'agence d'une activité sur cette ligne est celle de la fiche client. */
    public function auditAgencyId(): ?int
    {
        $agencyId = $this->customer()->value('agency_id');

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
