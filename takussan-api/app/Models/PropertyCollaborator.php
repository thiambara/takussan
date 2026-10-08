<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\CollaboratorRole;
use App\Services\Property\PrimaryAgentDesignator;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PropertyCollaborator extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'property_id', 'user_id', 'role',
        'commission_share', 'invited_at', 'accepted_at', 'metadata',
    ];

    /**
     * TCK-504 (ADR-0053) — `is_primary` n'est PAS `fillable` : seul
     * {@see PrimaryAgentDesignator} la pose, sous le verrou du bien.
     */
    protected $casts = [
        'role' => CollaboratorRole::class,
        'is_primary' => 'boolean',
        'commission_share' => 'decimal:2',
        'invited_at' => 'datetime',
        'accepted_at' => 'datetime',
        'metadata' => 'array',
    ];

    /**
     * TCK-504 (ADR-0053 §1) — retirer le rôle `agent` au principal, c'est le retirer comme
     * principal : la marque tombe avec le rôle, et le repli de TCK-502 reprend. Sans cela, le
     * `PUT …/collaborators/{c}` qui change le rôle heurterait le `CHECK`
     * `property_collaborators_primary_is_agent` et rendrait une 500.
     */
    protected static function booted(): void
    {
        static::saving(function (self $collaborator): void {
            if ($collaborator->is_primary && $collaborator->role !== CollaboratorRole::Agent) {
                $collaborator->is_primary = false;
            }
        });
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
