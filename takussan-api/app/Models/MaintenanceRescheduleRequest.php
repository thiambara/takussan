<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2917 (ADR-0118 § 3) — le demandeur d'une intervention demande un autre créneau : un à trois
 * instants proposés (`proposed_slots`, ISO 8601 au fuseau de l'application) et un mot.
 *
 * La ligne ne change jamais `scheduled_at`. Elle se clôt (`accepted`) quand le donneur d'ordre ou le
 * prestataire pose un créneau par les chemins existants ({@see self::closeFor()}), ou est remplacée
 * (`superseded`) par la demande suivante du même demandeur : une seule est en attente par intervention.
 */
class MaintenanceRescheduleRequest extends AbstractModel
{
    public const PENDING = 'pending';

    public const ACCEPTED = 'accepted';

    public const SUPERSEDED = 'superseded';

    public const MAX_SLOTS = 3;

    /** `status`, `resolved_at` et `resolved_by_id` ne s'écrivent que par ce modèle. */
    protected $fillable = ['maintenance_request_id', 'requester_id', 'proposed_slots', 'note'];

    protected $casts = [
        'proposed_slots' => 'array',
        'resolved_at' => 'datetime',
    ];

    public function maintenanceRequest(): BelongsTo
    {
        return $this->belongsTo(MaintenanceRequest::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by_id');
    }

    /**
     * Clôt la demande en attente de l'intervention : un créneau vient d'être posé par `$actor`. À
     * appeler dans la transaction qui écrit `scheduled_at`.
     */
    public static function closeFor(MaintenanceRequest $mr, ?User $actor): void
    {
        static::query()
            ->where('maintenance_request_id', $mr->getKey())
            ->where('status', self::PENDING)
            ->update([
                'status' => self::ACCEPTED,
                'resolved_at' => now(),
                'resolved_by_id' => $actor?->id,
                'updated_at' => now(),
            ]);
    }
}
