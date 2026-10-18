<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-942 (amendement du 2026-10-18 d'ADR-0061) — un achat ou une offre d'une Vedette, avec son prix
 * figé et sa durée. Une prolongation en ajoute une ; le remboursement les lit du dernier rang au
 * premier. Écrit par `App\Services\Boost\BoostPurchaseService` seul.
 */
class PropertyBoostTranche extends AbstractModel
{
    use HasFactory;

    protected $fillable = ['property_boost_id', 'position', 'price_credits', 'duration_days', 'offered'];

    protected $casts = [
        'position' => 'integer',
        'price_credits' => 'integer',
        'duration_days' => 'integer',
        'offered' => 'boolean',
    ];

    public function boost(): BelongsTo
    {
        return $this->belongsTo(PropertyBoost::class, 'property_boost_id');
    }
}
