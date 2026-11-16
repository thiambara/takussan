<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\Currency;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

/**
 * TCK-2911 (ADR-0120 § 3) — un devis consulté et non retenu pour une intervention : la « mise en
 * concurrence » que le bailleur lit à côté du devis recommandé (`quote_*` de la demande).
 *
 * Écrit par le seul personnel de l'agence du bien (`MaintenanceRequestPolicy::manageQuoteAlternatives`),
 * lu des seuls donneurs d'ordre — jamais d'un prestataire, l'assigné compris. Un prestataire du compte
 * (`provider_id`) ou un nom libre (`provider_name`). Pièce facultative, privée (`quote`).
 */
class MaintenanceQuoteAlternative extends AbstractModel implements HasMedia
{
    use InteractsWithMedia;

    /** Au plus autant de devis concurrents par intervention. */
    public const MAX_PER_REQUEST = 5;

    protected $fillable = ['maintenance_request_id', 'provider_id', 'provider_name', 'amount', 'currency', 'created_by_id'];

    protected $casts = [
        'amount' => 'decimal:2',
        'currency' => Currency::class,
    ];

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('quote')->singleFile();
    }

    public function maintenanceRequest(): BelongsTo
    {
        return $this->belongsTo(MaintenanceRequest::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'provider_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
