<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\UpdateAiRoleRequest;
use App\Models\AiEvaluationRun;
use App\Models\AiRoleAssignment;
use App\Models\Enums\AiModelRole;
use App\Services\Ai\AiProviderCatalogue;
use App\Services\Ai\ModelLink;
use App\Services\Ai\ModelResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** TCK-2385 (ADR-0076 §2, §12) — l'affectation des rôles de modèle depuis la console. */
class AiRoleController extends Controller
{
    public function __construct(
        private readonly ModelResolver $resolver,
        private readonly AiProviderCatalogue $providers,
    ) {}

    public function index(): JsonResponse
    {
        $stored = AiRoleAssignment::query()->get()->keyBy(fn (AiRoleAssignment $a): string => $a->role->value);

        return $this->json(['data' => [
            'roles' => array_map(fn (AiModelRole $role): array => [
                'role' => $role->value,
                'source' => isset($stored[$role->value]) ? 'database' : 'config',
                'chain' => $this->links($this->resolver->chainForRole($role)),
                'updated_at' => $this->instant(($stored[$role->value] ?? null)?->updated_at),
            ], AiModelRole::cases()),
            'providers' => $this->providers->describe(),
        ]]);
    }

    public function update(UpdateAiRoleRequest $request, string $role): JsonResponse
    {
        $aiRole = AiModelRole::tryFrom($role);
        abort_code_unless($aiRole !== null, 404, 'ai.role_unknown');
        $chain = array_map(ModelLink::fromArray(...), array_values($request->validated('chain')));
        foreach ($chain as $link) {
            abort_code_unless($link->isPriced(), 422, 'ai.model_unpriced');
        }

        $before = $this->resolver->chainForRole($aiRole);
        // TCK-2385 (AC4) — le cliquet : un premier maillon NEUF dont l'évaluation terminée est sous
        // la référence ne s'affecte qu'avec un motif, journalisé. Un maillon jamais évalué passe :
        // la console PROPOSE l'évaluation, elle ne l'impose pas (ADR-0076 §8).
        $current = $before[0] ?? null;
        if ($current === null || $current->provider !== $chain[0]->provider || $current->model !== $chain[0]->model) {
            abort_code_if(
                AiEvaluationRun::latestFor($aiRole, $chain[0])?->below_baseline === true && blank($request->validated('override_reason')),
                422,
                'ai.evaluation_below_baseline',
            );
        }
        $assignment = AiRoleAssignment::query()->updateOrCreate(
            ['role' => $aiRole->value],
            ['chain' => $this->links($chain), 'updated_by_id' => $request->user()->id],
        );

        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($assignment)
            ->withProperties([
                'role' => $aiRole->value,
                'before' => $this->links($before),
                'after' => $assignment->chain,
                'override_reason' => $request->validated('override_reason'),
            ])
            ->event('super_admin_ai_role_updated')
            ->log('Chaîne de modèles d\'un rôle IA modifiée');

        return $this->index();
    }

    public function destroy(Request $request, string $role): JsonResponse
    {
        $aiRole = AiModelRole::tryFrom($role);
        abort_code_unless($aiRole !== null, 404, 'ai.role_unknown');
        $assignment = AiRoleAssignment::query()->where('role', $aiRole->value)->first();

        if ($assignment !== null) {
            activity('Admin')
                ->causedBy($request->user())
                ->performedOn($assignment)
                ->withProperties(['role' => $aiRole->value, 'before' => $assignment->chain, 'after' => null])
                ->event('super_admin_ai_role_reset')
                ->log('Rôle IA rendu à la configuration');
            $assignment->delete();
        }

        return $this->index();
    }

    /**
     * @param  list<ModelLink>  $chain
     * @return list<array{provider: string, model: string, max_tokens: int|null}>
     */
    private function links(array $chain): array
    {
        return array_map(fn (ModelLink $link): array => $link->toArray(), $chain);
    }
}
