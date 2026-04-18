<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\AgencyResource;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AgencyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $paginator = Agency::query()
            ->when($request->input('q'), fn ($q, $s) => $q->where('name', 'like', "%$s%"))
            ->latest()
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => AgencyResource::collection($paginator)->toArray($request),
            'meta' => ['total' => $paginator->total(), 'current_page' => $paginator->currentPage()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $alreadyOwns = Agency::where('primary_admin_id', $user->id)->exists();
        abort_if(
            $alreadyOwns && ! $user->hasRole(['admin', 'super_admin']),
            422,
            'You already administer an agency.'
        );

        $data = $request->validate([
            'name' => ['required', 'string'],
            'license_number' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'phone' => ['nullable', 'string'],
            'website' => ['nullable', 'url'],
            'commission_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'status' => ['nullable', Rule::enum(AgencyStatus::class)],
        ]);

        $agency = Agency::create(array_merge($data, [
            'primary_admin_id' => $user->id,
            'status' => $data['status'] ?? AgencyStatus::Active->value,
        ]));

        return $this->json(['data' => AgencyResource::make($agency)->toArray($request)], 201);
    }

    public function show(Request $request, Agency $agency): JsonResponse
    {
        return $this->json(['data' => AgencyResource::make($agency)->toArray($request)]);
    }

    public function update(Request $request, Agency $agency): JsonResponse
    {
        abort_unless($agency->primary_admin_id === $request->user()->id || $request->user()->hasRole(['admin', 'super_admin']), 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string'],
            'license_number' => ['sometimes', 'nullable', 'string'],
            'description' => ['sometimes', 'nullable', 'string'],
            'email' => ['sometimes', 'nullable', 'email'],
            'phone' => ['sometimes', 'nullable', 'string'],
            'website' => ['sometimes', 'nullable', 'url'],
            'commission_rate' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'settings' => ['sometimes', 'nullable', 'array'],
        ]);

        $agency->fill($data)->save();

        return $this->json(['data' => AgencyResource::make($agency->refresh())->toArray($request)]);
    }

    public function destroy(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_unless(
            $user->hasRole(['admin', 'super_admin']) || $agency->primary_admin_id === $user->id,
            403
        );

        $agency->delete();

        return $this->json(null, 204);
    }
}
