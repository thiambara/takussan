<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\PaymentLinkSubject;
use App\Models\Enums\ReminderChannel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2658 (ADR-0105 § 2) — une relance d'impayé NOTÉE par l'agence : l'échéance, le canal,
 * l'auteur, la date, une note libre facultative. Le texte du message n'est pas stocké (le front le
 * possède, principe 5). Les rappels automatiques ne vivent pas ici : ils restent dans
 * `lease_payments.metadata.reminder_{jalon}_sent_at`, et `LeasePaymentReminderReader` relit les deux.
 *
 * Une ligne ne se modifie pas : un fait noté. Pas d'`updated_at`.
 */
class LeasePaymentReminder extends AbstractModel
{
    use Auditable;

    public const UPDATED_AT = null;

    /**
     * TCK-601 (ADR-0044 § 3) — le journal d'audit dit qu'une relance a eu lieu, pas ce que la note
     * contient : une note libre peut porter un numéro ou un nom (TCK-613).
     */
    public const AUDIT_ONLY = ['agency_id', 'lease_payment_id', 'channel', 'subject', 'created_by_id'];

    /** TCK-2778 — `subject` : ce que la relance relance, déduit de l'échéance par le contrôleur, jamais reçu. */
    protected $fillable = ['agency_id', 'lease_payment_id', 'channel', 'subject', 'created_by_id', 'note'];

    protected $casts = [
        'channel' => ReminderChannel::class,
        'subject' => PaymentLinkSubject::class,
    ];

    public function leasePayment(): BelongsTo
    {
        return $this->belongsTo(LeasePayment::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
