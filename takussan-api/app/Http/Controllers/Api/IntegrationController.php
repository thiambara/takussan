<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\IntegrationResource;
use App\Models\Integration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntegrationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Integration::query();

        if (! $user->hasRole(['admin', 'super_admin'])) {
            abort_unless($user->hasRole('agency_admin') && $user->agency_id, 403);
            $base->where('agency_id', $user->agency_id);
        }

        $paginator = Integration::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->json([
            'data' => IntegrationResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'provider' => ['required', 'string', 'max:255'],
            'agency_id' => ['nullable', 'exists:agencies,id'],
            'credentials' => ['required', 'array'],
            'is_active' => ['nullable', 'boolean'],
            'metadata' => ['nullable', 'array'],
        ]);

        $agencyId = $data['agency_id'] ?? $user->agency_id;

        abort_unless(
            $user->hasRole(['admin', 'super_admin']) || ($user->hasRole('agency_admin') && $user->agency_id === $agencyId),
            403,
            'You can only manage your own agency integrations.'
        );

        if (isset($data['credentials'])) {
            $data['credentials'] = json_encode($data['credentials']);
        }

        $integration = Integration::create(array_merge($data, [
            'agency_id' => $agencyId,
            'is_active' => $data['is_active'] ?? true,
        ]));

        return $this->json(['data' => IntegrationResource::make($integration)->toArray($request)], 201);
    }

    public function update(Request $request, Integration $integration): JsonResponse
    {
        $user = $request->user();

        abort_unless(
            $user->hasRole(['admin', 'super_admin']) || ($user->hasRole('agency_admin') && $user->agency_id === $integration->agency_id),
            403
        );

        $data = $request->validate([
            'credentials' => ['sometimes', 'required', 'array'],
            'is_active' => ['sometimes', 'boolean'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        if (isset($data['credentials'])) {
            $data['credentials'] = json_encode($data['credentials']);
        }

        $integration->fill($data)->save();

        return $this->json(['data' => IntegrationResource::make($integration->refresh())->toArray($request)]);
    }

    public function destroy(Request $request, Integration $integration): JsonResponse
    {
        $user = $request->user();

        abort_unless(
            $user->hasRole(['admin', 'super_admin']) || ($user->hasRole('agency_admin') && $user->agency_id === $integration->agency_id),
            403
        );

        $integration->delete();

        return $this->json(null, 204);
    }
}
