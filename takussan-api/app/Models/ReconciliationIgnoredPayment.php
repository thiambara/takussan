<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\IgnoredPaymentReason;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * TCK-2932 — un paiement sorti du « reste à rapprocher » : il n'aura jamais de ligne de banque.
 *
 * Rien d'autre ne change : la ligne ne touche ni le paiement (statut, montant, `bank_reconciled_at`),
 * ni une quittance, ni un reversement. `ReconciliationOverviewService::paidInPeriod()` la lit pour
 * classer le paiement `ignored` au lieu de `to_reconcile`. Défaire le geste supprime la ligne ; les
 * deux gestes sont journalisés sur le paiement (`payment_ignored`, `payment_unignored`).
 *
 * `payable_type` porte la classe du paiement, comme `bank_statement_lines.matched_payment_type`.
 */
class ReconciliationIgnoredPayment extends AbstractModel
{
    protected $fillable = ['agency_id', 'payable_type', 'payable_id', 'reason', 'note', 'ignored_by_id'];

    protected $casts = [
        'reason' => IgnoredPaymentReason::class,
    ];

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function payable(): MorphTo
    {
        return $this->morphTo();
    }

    public function ignoredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ignored_by_id');
    }
}
