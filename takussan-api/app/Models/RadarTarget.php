<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\RadarTargetOrigin;
use App\Models\Enums\RadarTargetStatus;
use App\Services\Radar\Targets\RadarTargetCriteria;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * TCK-2468 (ADR-0087 §5) — une cible du Radar : ce que l'opérateur (ou la demande, TCK-2470) cherche.
 *
 * `criteria` : la forme normalisée de {@see RadarTargetCriteria} (toutes les clés présentes, listes vides et null = sans
 * contrainte) ; `criteria_signature` son empreinte, unique parmi les cibles non retirées. Une source ciblée ne saisit une
 * annonce nouvelle que si sa carte peut correspondre à une cible `active` qui concerne son site ; après l'extraction,
 * l'annonce est rattachée (`listings()`) aux cibles actives dont elle remplit strictement les critères.
 *
 * `pinned` : la révision de la demande par l'IA (TCK-2470) ne la touche pas ; modifier les critères d'une cible `demand`
 * l'épingle. Les écritures passent par `App\Services\Radar\Targets\RadarTargets` (plafond, doublon, verrou).
 */
class RadarTarget extends AbstractModel
{
    protected $fillable = [
        'name', 'origin', 'status', 'pinned', 'criteria', 'criteria_signature', 'demand_count', 'matches_count',
        'last_matched_at', 'created_by_id',
    ];

    protected $casts = [
        'origin' => RadarTargetOrigin::class,
        'status' => RadarTargetStatus::class,
        'pinned' => 'boolean',
        'criteria' => 'array',
        'demand_count' => 'integer',
        'matches_count' => 'integer',
        'last_matched_at' => 'datetime',
        'created_by_id' => 'integer',
    ];

    protected static array $requestFilterable = ['origin', 'status'];

    protected static array $requestSortable = ['matches_count', 'created_at', 'name'];

    // `criteria_signature` n'est pas lisible : une donnée de calcul, pas d'affichage.
    protected static array $queryFields = [
        'id', 'name', 'origin', 'status', 'pinned', 'criteria', 'demand_count', 'matches_count', 'last_matched_at',
        'created_by_id', 'created_at', 'updated_at',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    /** Les annonces extraites qui remplissent ses critères. */
    public function listings(): BelongsToMany
    {
        return $this->belongsToMany(RadarListing::class, 'radar_listing_target')->withPivot('matched_at');
    }
}
