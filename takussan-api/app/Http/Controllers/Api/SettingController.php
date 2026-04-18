<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\SettingResource;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SettingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        
        $query = Setting::query();
        
        if (!$user->hasRole(['admin', 'super_admin'])) {
            abort_unless($user->agency_id, 403);
            $query->where(function($q) use ($user) {
                $q->where('scope', SettingScope::Agency)
                  ->where('scope_id', $user->agency_id);
                $q->orWhere('scope', SettingScope::Global);
            });
        }
        
        if ($request->filled('scope')) {
            $query->where('scope', $request->input('scope'));
        }
        
        $paginator = $query->latest()
            ->paginate((int) $request->input('per_page', 50));

        return $this->json([
            'data' => SettingResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', 'max:255'],
            'value' => ['required', 'array'],
            'scope' => ['required', Rule::enum(SettingScope::class)],
            'scope_id' => ['nullable', 'integer'],
        ]);

        $user = $request->user();

        if ($data['scope'] === SettingScope::Global->value) {
            abort_unless($user->hasRole(['admin', 'super_admin']), 403, 'Only admins can manage global settings.');
        } else {
            $targetAgencyId = $data['scope_id'] ?? $user->agency_id;
            abort_unless(
                $user->hasRole(['admin', 'super_admin']) || ($user->hasRole('agency_admin') && $user->agency_id === $targetAgencyId),
                403,
                'You can only manage your own agency settings.'
            );
            $data['scope_id'] = $targetAgencyId;
        }

        $setting = Setting::updateOrCreate(
            [
                'key' => $data['key'],
                'scope' => $data['scope'],
                'scope_id' => $data['scope_id'] ?? null,
            ],
            [
                'value' => $data['value'],
                'updated_by_id' => $user->id,
            ]
        );

        return $this->json(['data' => SettingResource::make($setting)->toArray($request)], $setting->wasRecentlyCreated ? 201 : 200);
    }

    public function update(Request $request, Setting $setting): JsonResponse
    {
        $user = $request->user();

        if ($setting->scope === SettingScope::Global) {
            abort_unless($user->hasRole(['admin', 'super_admin']), 403);
        } else {
            abort_unless(
                $user->hasRole(['admin', 'super_admin']) || ($user->hasRole('agency_admin') && $user->agency_id === $setting->scope_id),
                403
            );
        }

        $data = $request->validate([
            'value' => ['required', 'array'],
        ]);

        $setting->update([
            'value' => $data['value'],
            'updated_by_id' => $user->id,
        ]);

        return $this->json(['data' => SettingResource::make($setting->refresh())->toArray($request)]);
    }

    public function destroy(Request $request, Setting $setting): JsonResponse
    {
        $user = $request->user();

        if ($setting->scope === SettingScope::Global) {
            abort_unless($user->hasRole(['admin', 'super_admin']), 403);
        } else {
            abort_unless(
                $user->hasRole(['admin', 'super_admin']) || ($user->hasRole('agency_admin') && $user->agency_id === $setting->scope_id),
                403
            );
        }

        $setting->delete();

        return $this->json(null, 204);
    }
}
