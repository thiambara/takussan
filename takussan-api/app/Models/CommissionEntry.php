<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\CommissionOrigin;
use App\Models\Enums\Currency;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-595 (ADR-0049 §3) — une ligne du grand livre des commissions : la part d'un bénéficiaire sur
 * la commission d'un bail, figée à l'activation par `CommissionLedgerService::generateFor()`.
 *
 * Elle ne se recalcule jamais depuis le bail ni depuis les parts courantes des collaborateurs : seul
 * l'admin la fait changer d'état (`due` → `paid` | `cancelled`), et `Auditable` journalise le geste
 * sous le nom `CommissionEntry`.
 */
class CommissionEntry extends AbstractModel
{
    use Auditable, HasFactory;

    protected $fillable = [
        'agency_id', 'lease_id', 'beneficiary_id', 'origin',
        'base_amount', 'share_percent', 'amount', 'currency', 'status',
        'earned_at', 'paid_at', 'paid_by_id', 'cancelled_at', 'cancelled_by_id', 'metadata',
    ];

    protected $casts = [
        'origin' => CommissionOrigin::class,
        'status' => CommissionEntryStatus::class,
        'currency' => Currency::class,
        'base_amount' => 'decimal:2',
        'share_percent' => 'decimal:2',
        'amount' => 'decimal:2',
        'earned_at' => 'datetime',
        'paid_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['status', 'beneficiary_id', 'lease_id', 'origin'];

    protected static array $requestSortable = ['id', 'earned_at', 'amount', 'paid_at'];

    protected static array $requestLoadable = ['lease', 'beneficiary'];

    protected static array $queryFields = [
        'id', 'agency_id', 'lease_id', 'beneficiary_id', 'origin',
        'base_amount', 'share_percent', 'amount', 'currency', 'status',
        'earned_at', 'paid_at', 'paid_by_id', 'cancelled_at', 'cancelled_by_id',
        'created_at', 'updated_at',
    ];

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function beneficiary(): BelongsTo
    {
        return $this->belongsTo(User::class, 'beneficiary_id');
    }
}
