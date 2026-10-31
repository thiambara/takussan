<?php

namespace App\Services\Ai;

use App\Models\AiModel;
use App\Models\AiRoleAssignment;
use App\Models\AiUsageSetting;
use Illuminate\Support\Carbon;

/**
 * TCK-2448 (ADR-0085 §1) — la seule source de vérité de « tarifé et affectable » : l'union des lignes
 * d'`ai_models` et des couples de `config('ai.pricing')`. Une ligne l'emporte sur la configuration
 * pour le même couple, y compris pour retirer un modèle de la configuration. La comparaison des
 * identifiants est exacte (sensible à la casse).
 */
final class AiModelCatalogue
{
    /**
     * Le tarif d'un couple, retiré ou non : un appel déjà parti se compte encore.
     *
     * @return array{input: string, output: string, cache_read: string, cache_write: string}|null
     */
    public function priceOf(string $provider, string $model): ?array
    {
        return $this->row($provider, $model)?->prices() ?? config('ai.pricing')[$provider][$model] ?? null;
    }

    /** Le tarif que la configuration déclare, chez un fournisseur déclaré : ce à quoi une ligne peut revenir. */
    public function configuredPriceOf(string $provider, string $model): ?array
    {
        return array_key_exists($provider, config('ai.providers')) ? (config('ai.pricing')[$provider][$model] ?? null) : null;
    }

    /** Actif au catalogue, chez un fournisseur déclaré. */
    public function isAssignable(string $provider, string $model): bool
    {
        if (! array_key_exists($provider, config('ai.providers'))) {
            return false;
        }
        $row = $this->row($provider, $model);

        return $row !== null ? $row->active : isset(config('ai.pricing')[$provider][$model]);
    }

    /**
     * Tout le catalogue d'un fournisseur déclaré, les modèles retirés compris. La configuration
     * d'abord, puis les modèles ajoutés dans la console.
     *
     * @return list<array{id: int|null, provider: string, model: string, input: string, output: string, cache_read: string, cache_write: string, active: bool, origin: 'console'|'config', in_config: bool, updated_at: Carbon|null}>
     */
    public function entries(): array
    {
        $rows = AiModel::query()->orderBy('model')->get()->groupBy('provider');
        $entries = [];
        foreach (array_keys(config('ai.providers')) as $provider) {
            $configured = config('ai.pricing')[$provider] ?? [];
            $byModel = ($rows[$provider] ?? collect())->keyBy('model');
            foreach ($configured as $model => $price) {
                $row = $byModel[$model] ?? null;
                $entries[] = $this->entry($provider, (string) $model, $price, $row, true);
            }
            foreach ($byModel as $model => $row) {
                if (! array_key_exists($model, $configured)) {
                    $entries[] = $this->entry($provider, (string) $model, $row->prices(), $row, false);
                }
            }
        }

        return $entries;
    }

    /** @return list<string> */
    public function assignableModels(string $provider): array
    {
        return array_values(array_map(
            fn (array $entry): string => $entry['model'],
            array_filter($this->entries(), fn (array $entry): bool => $entry['provider'] === $provider && $entry['active']),
        ));
    }

    public function cheapestModel(string $provider): ?string
    {
        $cheapest = null;
        foreach ($this->entries() as $entry) {
            if ($entry['provider'] === $provider && $entry['active'] && ($cheapest === null || AiMoney::compare($entry['input'], $cheapest['input']) < 0)) {
                $cheapest = $entry;
            }
        }

        return $cheapest['model'] ?? null;
    }

    /**
     * Ce qui emploie un couple : les chaînes en base, les modèles forcés, et les chaînes de repli de
     * la configuration, comptées même quand le rôle a une chaîne en base : revenir à la configuration
     * (`AiRoleController::destroy`) les rejouerait.
     *
     * @return array{roles: list<string>, usages: list<string>, fallback_roles: list<string>}
     */
    public function usesOf(string $provider, string $model): array
    {
        $employs = fn (array $chain): bool => collect($chain)->contains(fn (array $link): bool => $link['provider'] === $provider && $link['model'] === $model);

        return [
            'roles' => AiRoleAssignment::query()->orderBy('role')->get()
                ->filter(fn (AiRoleAssignment $assignment): bool => $employs($assignment->chain))
                ->map(fn (AiRoleAssignment $assignment): string => $assignment->role->value)->values()->all(),
            'usages' => AiUsageSetting::query()->where('forced_provider', $provider)->where('forced_model', $model)->orderBy('usage_key')->pluck('usage_key')->all(),
            'fallback_roles' => array_keys(array_filter(config('ai.roles', []), $employs)),
        ];
    }

    private function row(string $provider, string $model): ?AiModel
    {
        return AiModel::query()->where('provider', $provider)->where('model', $model)->first();
    }

    /**
     * @param  array{input: string, output: string, cache_read: string, cache_write: string}  $configured
     * @return array{id: int|null, provider: string, model: string, input: string, output: string, cache_read: string, cache_write: string, active: bool, origin: 'console'|'config', in_config: bool, updated_at: Carbon|null}
     */
    private function entry(string $provider, string $model, array $configured, ?AiModel $row, bool $inConfig): array
    {
        return [
            'id' => $row?->id,
            'provider' => $provider,
            'model' => $model,
            ...array_map(AiMoney::canonical(...), $row?->prices() ?? $configured),
            'active' => $row?->active ?? true,
            'origin' => $row !== null ? 'console' : 'config',
            'in_config' => $inConfig,
            'updated_at' => $row?->updated_at,
        ];
    }
}
