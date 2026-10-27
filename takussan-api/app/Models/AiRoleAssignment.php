<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\AiModelRole;

/** TCK-2383 (ADR-0076 §2) — la chaîne de modèles d'un rôle, réglée depuis la console. */
class AiRoleAssignment extends AbstractModel
{
    protected $fillable = ['role', 'chain', 'updated_by_id'];

    protected $casts = [
        'role' => AiModelRole::class,
        'chain' => 'array',
    ];
}
