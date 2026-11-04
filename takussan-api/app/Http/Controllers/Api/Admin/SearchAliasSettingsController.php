<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\ShowSearchAliasSettingsRequest;
use App\Http\Requests\Api\Admin\UpdateSearchAliasSettingsRequest;
use App\Http\Resources\Api\Admin\SearchAliasSettingResource;
use App\Models\SearchAliasSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2476 (ADR-0088 §7, revue adverse du 2026-11-04) — le réglage des variantes d'écriture tenues par l'IA : le lire,
 * l'allumer, l'éteindre. `super_admin` seul (`routes/api/admin-search.php`, `platform.settings.manage`). Même règle que
 * les cibles de la demande ({@see RadarDemandController::update()}).
 */
class SearchAliasSettingsController extends Controller
{
    public function show(ShowSearchAliasSettingsRequest $request): JsonResponse
    {
        return $this->json(['data' => new SearchAliasSettingResource(SearchAliasSetting::current()->load('operator'))]);
    }

    /**
     * Allumer : l'appelant devient l'opérateur — aussi quand le réglage est allumé mais que son opérateur a disparu (c'est
     * ainsi qu'on le reprend). Éteindre : l'opérateur reste affiché, rien ne part.
     */
    public function update(UpdateSearchAliasSettingsRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $enabled = $request->boolean('enabled');

        $setting = DB::transaction(function () use ($user, $enabled): SearchAliasSetting {
            SearchAliasSetting::current();
            $setting = SearchAliasSetting::query()->whereKey(SearchAliasSetting::ID)->lockForUpdate()->firstOrFail();
            $takesOver = $enabled && (! $setting->enabled || $setting->blockedReason() === SearchAliasSetting::BLOCKED_OPERATOR_MISSING);
            $setting->enabled = $enabled;
            if ($takesOver) {
                $setting->operator_id = $user->id;
                $setting->enabled_at = now();
            }
            $setting->save();

            return $setting;
        });

        activity('Admin')
            ->causedBy($user)
            ->performedOn($setting)
            ->withProperties(['enabled' => $enabled])
            ->event('search_alias_settings_updated')
            ->log('Variantes d\'écriture réglées');

        return $this->json(['data' => new SearchAliasSettingResource($setting->fresh()->load('operator'))]);
    }
}
