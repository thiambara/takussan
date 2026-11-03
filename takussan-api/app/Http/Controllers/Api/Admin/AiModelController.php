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
 * se corrige ou se retire en créant sa ligne, qui l'emporte, et cette ligne s'efface pour revenir à la
 * configuration. Tout autre retrait est `active` à faux : un modèle retiré reste visible, et se rétablit.
 */
class AiModelController extends Controller
{
    public function __construct(private readonly AiModelCatalogue $catalogue) {}

    public function index(): JsonResponse
    {
        return $this->json([
            'data' => array_map(fn (array $entry): array => [
                'updated_at' => $this->instant($entry['updated_at']),
                'uses' => $entry['active'] ? null : $this->stillUsing($entry['provider'], $entry['model']),
            ] + $entry, $this->catalogue->entries()),
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

    /**
     * Efface la ligne qui remplace un modèle de la configuration : le tarif de la configuration s'applique de
     * nouveau. Le modèle reste au catalogue, donc aucun emploi ne se casse et le refus d'emploi n'a pas lieu d'être.
     * Sans entrée de configuration il disparaîtrait : refusé, il se retire par `active`.
     */
    public function destroy(string $model): JsonResponse
    {
        $model = AiModel::query()->findOrFail((int) $model);
        $configured = $this->catalogue->configuredPriceOf($model->provider, $model->model);
        if ($configured === null) {
            throw new ApiError(409, 'ai.model_not_in_config');
        }
        $before = $this->state($model);
        $model->delete();

        activity('Admin')
            ->causedBy(request()->user())
            ->performedOn($model)
            ->withProperties(['provider' => $model->provider, 'model' => $model->model, 'before' => $before, 'after' => [...$configured, 'active' => true]])
            ->event('super_admin_ai_model_reverted')
            ->log('Modèle IA revenu à la configuration');

        return $this->index();
    }

    /**
     * Ce qui emploie encore un modèle retiré : une affectation concurrente ou un déploiement peut le laisser en chaîne.
     *
     * @return array{roles: list<string>, usages: list<string>, fallback_roles: list<string>}|null
     */
    private function stillUsing(string $provider, string $model): ?array
    {
        $uses = $this->catalogue->usesOf($provider, $model);

        return $uses === ['roles' => [], 'usages' => [], 'fallback_roles' => []] ? null : $uses;
    }

    /** Un modèle employé ne se retire pas : le prochain appel, ou le prochain repli, viserait un modèle retiré. */
    private function refuseIfInUse(string $provider, string $model): void
    {
        $uses = $this->stillUsing($provider, $model);
        if ($uses === null) {
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
