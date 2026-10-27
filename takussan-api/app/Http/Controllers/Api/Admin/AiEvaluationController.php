<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreAiEvaluationRequest;
use App\Jobs\Ai\RunAiEvaluation;
use App\Models\AiEvaluationRun;
use App\Models\Enums\AiEvaluationStatus;
use App\Models\Enums\AiModelRole;
use App\Services\Ai\AiUsage;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\ModelLink;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

/** TCK-2385 (ADR-0076 §8) — évaluer un candidat avant de l'affecter : « en place / candidat ». */
class AiEvaluationController extends Controller
{
    public function __construct(
        private readonly AiUsageRegistry $registry,
        private readonly EvaluationRunner $runner,
    ) {}

    public function store(StoreAiEvaluationRequest $request): JsonResponse
    {
        $role = AiModelRole::from($request->validated('role'));
        $link = new ModelLink($request->validated('provider'), $request->validated('model'), $request->validated('max_tokens'));
        abort_code_unless($link->isPriced(), 422, 'ai.model_unpriced');
        $evaluable = array_filter($this->registry->forRole($role), fn (AiUsage $usage): bool => $this->runner->cases($usage->key()) !== []);
        abort_code_if($evaluable === [], 422, 'ai.eval.no_cases');

        // Deux évaluations du même candidat sur le même rôle se doubleraient en coût et en verdicts.
        // Le contrôle et la création tiennent sous un verrou : sans lui, deux POST simultanés (double clic)
        // lisent tous deux « rien en cours » puis créent chacun une évaluation. `get()` et non `block()` :
        // un verrou déjà tenu signifie qu'une demande identique est en train de créer son évaluation, donc
        // « déjà en cours » (409) est exact, et on n'immobilise pas un worker HTTP à attendre.
        $verrou = Cache::lock('ai-eval:'.$role->value.':'.$link->provider.':'.$link->model, 10);
        abort_code_unless($verrou->get(), 409, 'ai.eval.already_running');
        try {
            // Une évaluation orpheline (worker mort) est déclarée perdue au passage : elle ne bloque pas.
            $enCours = AiEvaluationRun::query()
                ->where('role', $role->value)
                ->whereIn('status', [AiEvaluationStatus::Queued->value, AiEvaluationStatus::Running->value])
                ->where('candidate->provider', $link->provider)
                ->where('candidate->model', $link->model)
                ->get()
                ->contains(fn (AiEvaluationRun $run): bool => in_array($run->markLostIfStale()->status, [AiEvaluationStatus::Queued, AiEvaluationStatus::Running], true));
            abort_code_if($enCours, 409, 'ai.eval.already_running');

            $run = AiEvaluationRun::query()->create([
                'role' => $role, 'candidate' => $link->toArray(), 'status' => AiEvaluationStatus::Queued,
                'requested_by_id' => $request->user()->id,
            ]);
        } finally {
            $verrou->release();
        }
        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($run)
            ->withProperties(['role' => $role->value, 'candidate' => $link->toArray()])
            ->event('super_admin_ai_evaluation_requested')
            ->log('Évaluation d\'un modèle IA demandée');
        RunAiEvaluation::dispatch($run->id);

        return $this->json(['data' => $this->present($run->fresh())], 202);
    }

    public function show(string $evaluation): JsonResponse
    {
        return $this->json(['data' => $this->present(AiEvaluationRun::query()->findOrFail((int) $evaluation)->markLostIfStale())]);
    }

    /** @return array<string, mixed> */
    private function present(AiEvaluationRun $run): array
    {
        return [
            'id' => $run->id,
            'role' => $run->role->value,
            'candidate' => $run->candidate,
            'status' => $run->status->value,
            'below_baseline' => $run->below_baseline,
            'report' => $run->report,
            'error_code' => $run->error_code,
            'created_at' => $this->instant($run->created_at),
            'finished_at' => $this->instant($run->finished_at),
        ];
    }
}
