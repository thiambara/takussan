<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\UpdateAiUsageRequest;
use App\Models\AiUsageSetting;
use App\Services\Ai\AiBudget;
use App\Services\Ai\AiUsage;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\ModelLink;
use App\Services\Ai\ModelResolver;
use Illuminate\Http\JsonResponse;

/** TCK-2385 (ADR-0076 §4, §12) — coupe-circuit, modèle forcé et plafond des usages. */
class AiUsageController extends Controller
{
    public function __construct(
        private readonly AiUsageRegistry $registry,
        private readonly ModelResolver $resolver,
        private readonly AiBudget $budget,
    ) {}

    public function index(): JsonResponse
    {
        $settings = AiUsageSetting::query()->get()->keyBy('usage_key');

        return $this->json(['data' => array_values(array_map(function (AiUsage $usage) use ($settings): array {
            $setting = $settings[$usage->key()] ?? null;

            return [
                'key' => $usage->key(),
                'role' => $usage->role()->value,
                'prompt_version' => $usage->promptVersion(),
                'max_data_class' => $usage->maxDataClass()->value,
                'authority' => $usage->authority()->value,
                'enabled' => $setting?->enabled ?? true,
                'forced' => $setting?->forcedLink(null)?->toArray(),
                'daily_budget_xof' => $setting?->daily_budget_xof !== null ? (float) $setting->daily_budget_xof : $usage->dailyBudgetXof(),
                'default_daily_budget_xof' => $usage->dailyBudgetXof(),
                'spent_today_xof' => $this->budget->spentToday($usage->key()),
                'chain' => array_map(fn (ModelLink $link): array => $link->toArray(), $this->resolver->chainFor($usage, $setting)),
            ];
        }, $this->registry->all()))]);
    }

    public function update(UpdateAiUsageRequest $request, string $usage): JsonResponse
    {
        abort_code_unless($this->registry->has($usage), 404, 'ai.usage_unknown');
        $data = $request->validated();
        // Un modèle forcé se pose et se retire d'un bloc : la requête exige les deux ou aucun quand
        // elle les pose, mais `forced_model: null` seul passerait et laisserait un fournisseur
        // orphelin, qu'`AiUsageSetting::forcedLink()` ignore sans le dire.
        if (array_key_exists('forced_provider', $data) || array_key_exists('forced_model', $data)) {
            $setting = AiUsageSetting::query()->where('usage_key', $usage)->first();
            $provider = array_key_exists('forced_provider', $data) ? $data['forced_provider'] : $setting?->forced_provider;
            $model = array_key_exists('forced_model', $data) ? $data['forced_model'] : $setting?->forced_model;
            [$data['forced_provider'], $data['forced_model']] = filled($provider) && filled($model) ? [$provider, $model] : [null, null];
        }
        if (filled($data['forced_model'] ?? null)) {
            abort_code_unless((new ModelLink($data['forced_provider'], $data['forced_model']))->isPriced(), 422, 'ai.model_unpriced');
        }

        $setting = AiUsageSetting::query()->firstOrNew(['usage_key' => $usage]);
        $before = ['enabled' => $setting->enabled ?? true, 'forced_provider' => $setting->forced_provider, 'forced_model' => $setting->forced_model, 'daily_budget_xof' => $setting->daily_budget_xof];
        $setting->fill([...$data, 'enabled' => $data['enabled'] ?? $setting->enabled ?? true, 'updated_by_id' => $request->user()->id])->save();

        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($setting)
            ->withProperties([
                'usage' => $usage,
                'before' => $before,
                'after' => ['enabled' => $setting->enabled, 'forced_provider' => $setting->forced_provider, 'forced_model' => $setting->forced_model, 'daily_budget_xof' => $setting->daily_budget_xof],
            ])
            ->event('super_admin_ai_usage_updated')
            ->log('Réglages d\'un usage IA modifiés');

        return $this->index();
    }
}
