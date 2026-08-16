<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\Capability;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-279 — pivot fin rôle ↔ capacité (models-spec.md §53).
 *
 * `capability` est une valeur de l'enum `Capability`, pas une FK : le
 * catalogue est code-defined (ADR-0003).
 *
 * @property int $agency_role_id
 * @property string $capability
 */
class AgencyRoleCapability extends AbstractModel
{
    protected $table = 'agency_role_capabilities';

    protected $fillable = ['agency_role_id', 'capability'];

    protected static array $requestFilterable = ['agency_role_id', 'capability'];

    protected static array $queryFields = [
        'id', 'agency_role_id', 'capability', 'created_at', 'updated_at',
    ];

    public function agencyRole(): BelongsTo
    {
        return $this->belongsTo(AgencyRole::class);
    }

    public function toCapability(): ?Capability
    {
        return Capability::tryFrom((string) $this->capability);
    }
}
