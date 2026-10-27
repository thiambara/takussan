<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\AiEvaluationStatus;
use App\Models\Enums\AiModelRole;
use App\Services\Ai\ModelLink;

/** TCK-2385 — une évaluation de candidat lancée depuis la console, et son verdict. */
class AiEvaluationRun extends AbstractModel
{
    protected $fillable = ['role', 'candidate', 'status', 'report', 'below_baseline', 'error_code', 'requested_by_id', 'started_at', 'finished_at'];

    protected $casts = [
        'role' => AiModelRole::class,
        'candidate' => 'array',
        'status' => AiEvaluationStatus::class,
        'report' => 'array',
        'below_baseline' => 'boolean',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    /** La dernière évaluation TERMINÉE de ce maillon pour ce rôle. */
    public static function latestFor(AiModelRole $role, ModelLink $link): ?self
    {
        return self::query()
            ->where('role', $role->value)
            ->where('status', AiEvaluationStatus::Done->value)
            ->where('candidate->provider', $link->provider)
            ->where('candidate->model', $link->model)
            ->latest('id')
            ->first();
    }
}
