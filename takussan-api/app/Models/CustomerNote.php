<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Contracts\HasAuditAgency;
use App\Models\Enums\CustomerNoteKind;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\Support\LogOptions;

class CustomerNote extends AbstractModel implements HasAuditAgency
{
    use Auditable, HasFactory, SoftDeletes;

    protected $fillable = ['customer_id', 'author_id', 'body', 'pinned', 'kind'];

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

    /** TCK-601 (ADR-0044 §3) — l'agence d'une activité sur cette ligne est celle de la fiche client. */
    public function auditAgencyId(): ?int
    {
        $agencyId = $this->customer()->value('agency_id');

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
