<?php

namespace App\Http\Controllers\Api\Admin;

use App\Exceptions\ApiError;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreAiModelRequest;
use App\Http\Requests\Api\Admin\UpdateAiModelRequest;
use App\Models\AiModel;
use App\Services\Ai\AiModelCatalogue;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2448 (ADR-0085 §1) — le catalogue des modèles depuis la console. Un modèle de la configuration
 * se corrige ou se retire en créant sa ligne, qui l'emporte. Le retrait est `active` à faux, jamais un
 * effacement : un modèle retiré reste visible, et se rétablit.
 */
class AiModelController extends Controller
{
    public function __construct(private readonly AiModelCatalogue $catalogue) {}

    public function index(): JsonResponse
    {
        return $this->json([
            'data' => array_map(fn (array $entry): array => ['updated_at' => $this->instant($entry['updated_at'])] + $entry, $this->catalogue->entries()),
            'meta' => ['usd_to_xof' => (string) config('ai.usd_to_xof')],
        ]);
    }

    public function store(StoreAiModelRequest $request): JsonResponse
    {
        $data = $request->validated();
        if (! ($data['active'] ?? true)) {
            $this->refuseIfInUse($data['provider'], $data['model']);
        }
        $before = $this->catalogue->priceOf($data['provider'], $data['model']);
        $model = AiModel::query()->create($data + ['updated_by_id' => $request->user()->id]);

        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($model)
            ->withProperties(['provider' => $model->provider, 'model' => $model->model, 'before' => $before, 'after' => $this->state($model)])
            ->event('super_admin_ai_model_created')
            ->log('Modèle IA ajouté au catalogue');

        return $this->index();
    }

    /** `string` et non une liaison de modèle : celle-ci rendrait 404 avant que le droit soit jugé. */
    public function update(UpdateAiModelRequest $request, string $model): JsonResponse
    {
        $model = AiModel::query()->findOrFail((int) $model);
        $data = $request->validated();
        if ($model->active && array_key_exists('active', $data) && ! $data['active']) {
            $this->refuseIfInUse($model->provider, $model->model);
        }
        $before = $this->state($model);
        $model->fill($data + ['updated_by_id' => $request->user()->id])->save();

        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($model)
            ->withProperties(['provider' => $model->provider, 'model' => $model->model, 'before' => $before, 'after' => $this->state($model)])
            ->event('super_admin_ai_model_updated')
            ->log('Modèle IA du catalogue modifié');

        return $this->index();
    }

    /** Un modèle employé ne se retire pas : le prochain appel, ou le prochain repli, viserait un modèle retiré. */
    private function refuseIfInUse(string $provider, string $model): void
    {
        $uses = $this->catalogue->usesOf($provider, $model);
        if ($uses === ['roles' => [], 'usages' => [], 'fallback_roles' => []]) {
            return;
        }

        throw (new ApiError(409, 'ai.model_in_use', array_map(fn (array $names): string => $names === [] ? '—' : implode(', ', $names), $uses)))->with(['uses' => $uses]);
    }

    /** @return array<string, mixed> */
    private function state(AiModel $model): array
    {
        return [...$model->prices(), 'active' => (bool) ($model->active ?? true)];
    }
}
