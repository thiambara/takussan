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

        if (! $user->isSuperAdmin()) {
            abort_unless($user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id), 403);
            $base->where('agency_id', $user->agency_id);
        }

        $paginator = Integration::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->paginated($paginator, IntegrationResource::collection($paginator)->toArray($request));
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
            $user->isSuperAdmin() || ($user->agency_id !== null && $user->agency_id === $agencyId && $user->isAgencyAdminAt((int) $agencyId)),
            403,
            'You can only manage your own agency integrations.'
        );

        // TCK-078: the Integration model casts `credentials` as
        // `encrypted:array`, so Eloquent already serialises + encrypts on
        // the way in. Calling json_encode here would double-encode and
        // store a JSON-encoded string instead of the structured payload.

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
            $user->isSuperAdmin() || ($user->agency_id !== null && $user->agency_id === $integration->agency_id && $user->isAgencyAdminAt((int) $integration->agency_id)),
            403
        );

        $data = $request->validate([
            'credentials' => ['sometimes', 'required', 'array'],
            'is_active' => ['sometimes', 'boolean'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        // TCK-078: see store() — the model cast handles JSON + encryption,
        // writing the raw array keeps round-trips lossless.

        // TCK-110: PUT-style replacement for metadata. When the client
        // sends the `metadata` key (even as an empty object) it means
        // "replace the stored metadata entirely" — so clearing a single
        // field via the form actually wipes it server-side. When the
        // key is absent from the body, the stored metadata is left
        // untouched. `fill()` already gives us this behaviour for the
        // present-key-empty-object case (overwrites with `[]`); we
        // normalise `null` to `[]` so a payload of `metadata: null`
        // also clears.
        if ($request->has('metadata') && ! isset($data['metadata'])) {
            $data['metadata'] = [];
        }

        $integration->fill($data)->save();

        return $this->json(['data' => IntegrationResource::make($integration->refresh())->toArray($request)]);
    }

    public function destroy(Request $request, Integration $integration): JsonResponse
    {
        $user = $request->user();

        abort_unless(
            $user->isSuperAdmin() || ($user->agency_id !== null && $user->agency_id === $integration->agency_id && $user->isAgencyAdminAt((int) $integration->agency_id)),
            403
        );

        $integration->delete();

        return $this->json(null, 204);
    }

    /**
     * Lightweight connectivity check for a configured integration — TCK-068.
     *
     * The current iteration is intentionally minimal: we verify that the
     * integration is active and that credentials are present/non-empty,
     * and surface a provider-aware message. Real provider-specific checks
     * (Wave, Stripe, Orange Money…) belong in a dedicated Vague P2 ticket.
     */
    public function test(Request $request, Integration $integration): JsonResponse
    {
        $user = $request->user();

        abort_unless(
            $user->isSuperAdmin() || ($user->agency_id !== null && $user->agency_id === $integration->agency_id && $user->isAgencyAdminAt((int) $integration->agency_id)),
            403
        );

        if (! $integration->is_active) {
            return $this->json([
                'data' => [
                    'ok' => false,
                    'message' => __('messages.integration_inactive'),
                ],
            ]);
        }

        // `credentials` lives behind an `encrypted:array` cast, but legacy
        // controllers also sometimes write a pre-encoded JSON string, so
        // normalise both shapes before deciding the integration is empty.
        $credentials = $integration->credentials ?? [];
        if (is_string($credentials)) {
            $decoded = json_decode($credentials, true);
            $credentials = is_array($decoded) ? $decoded : [];
        }
        if (! is_array($credentials) || count($credentials) === 0) {
            return $this->json([
                'data' => [
                    'ok' => false,
                    'message' => __('messages.integration_missing_credentials'),
                ],
            ]);
        }

        $integration->forceFill(['last_used_at' => now()])->save();

        return $this->json([
            'data' => [
                'ok' => true,
                'message' => __('messages.integration_test_ok', ['provider' => $integration->provider]),
                'last_used_at' => $integration->last_used_at?->toIso8601String(),
            ],
        ]);
    }
}
