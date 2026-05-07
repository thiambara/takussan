<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Features\Flag;
use App\Http\Controllers\Base\Controller;
use App\Models\FeatureFlag;
use App\Services\Features\FeatureFlagEvaluator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FeatureFlagController extends Controller
{
    public function __construct(private readonly FeatureFlagEvaluator $evaluator) {}

    public function index(): JsonResponse
    {
        $stored = FeatureFlag::query()->get()->keyBy('key');

        return $this->json(['data' => collect(Flag::catalogue())->map(function (array $flag) use ($stored) {
            $row = $stored[$flag['key']] ?? null;

            return [
                ...$flag,
                'enabled' => (bool) ($row?->enabled ?? false),
                'segments' => $row?->segments_json ?? [],
                'updated_at' => $row?->updated_at?->toISOString(),
            ];
        })->values()->all()]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        abort_unless(Flag::tryFrom($key), 404, 'Unknown feature flag.');
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'segments' => ['nullable', 'array'],
            'segments.roles' => ['nullable', 'array'],
            'segments.roles.*' => ['string'],
            'segments.agency_ids' => ['nullable', 'array'],
            'segments.agency_ids.*' => ['integer'],
            'segments.rollout_percentage' => ['nullable', 'integer', 'min:0', 'max:100'],
        ]);
        $catalogue = Flag::from($key);
        $flag = FeatureFlag::updateOrCreate(
            ['key' => $key],
            [
                'label' => $catalogue->label(),
                'description' => $catalogue->description(),
                'enabled' => $data['enabled'],
                'segments_json' => $data['segments'] ?? [],
                'updated_by_id' => $request->user()->id,
            ],
        );

        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($flag)
            ->withProperties(['key' => $key, 'enabled' => $flag->enabled, 'segments' => $flag->segments_json])
            ->event('super_admin_feature_flag_updated')
            ->log('Feature flag modifié');

        return $this->index();
    }

    public function override(Request $request, string $key): JsonResponse
    {
        $data = $request->validate(['enabled' => ['required', 'boolean']]);
        $this->evaluator->setOverride($request->user(), $key, $data['enabled']);

        return $this->json(['data' => ['key' => $key, 'enabled' => $data['enabled']]]);
    }
}
