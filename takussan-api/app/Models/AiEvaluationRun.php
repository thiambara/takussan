<?php

namespace App\Models;

use App\Jobs\Ai\RunAiEvaluation;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\AiEvaluationStatus;
use App\Models\Enums\AiModelRole;
use App\Services\Ai\ModelLink;

/** TCK-2385 — une évaluation de candidat lancée depuis la console, et son verdict. */
class AiEvaluationRun extends AbstractModel
{
    /** Une évaluation `running` plus vieille que le délai du job (+ marge) n'a plus de worker : il est mort. */
    public const STALE_AFTER_SECONDS = RunAiEvaluation::TIMEOUT_SECONDS + 300;

    /** Une évaluation `queued` que personne n'a prise en un jour a perdu son job. */
    public const QUEUED_STALE_AFTER_SECONDS = 86400;

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

    /** Orpheline : son worker est mort et aucun job ne reste pour écrire une issue. */
    public function isStale(): bool
    {
        return match ($this->status) {
            AiEvaluationStatus::Running => $this->started_at !== null
                && $this->started_at->lt(now()->subSeconds(self::STALE_AFTER_SECONDS)),
            AiEvaluationStatus::Queued => $this->created_at !== null
                && $this->created_at->lt(now()->subSeconds(self::QUEUED_STALE_AFTER_SECONDS)),
            default => false,
        };
    }

    /**
     * Déclare perdue une évaluation orpheline, par une mise à jour CONDITIONNELLE à l'état lu : si le
     * worker d'origine a écrit son issue entre-temps, rien n'est réécrit.
     */
    public function markLostIfStale(): self
    {
        if (! $this->isStale()) {
            return $this;
        }
        $this->newQuery()->whereKey($this->getKey())->where('status', $this->status->value)->update([
            'status' => AiEvaluationStatus::Failed->value,
            'error_code' => 'ai.eval.job_lost',
            'finished_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->refresh();
    }
}
