<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\IdType;
use App\Models\Guarantor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class GuarantorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Guarantor::query();

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $query->where('added_by_id', $user->id);
        }

        if ($leaseId = $request->input('lease_id')) {
            $query->whereHas('leases', fn ($q) => $q->where('id', $leaseId));
        }

        $paginator = $query->latest()->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => $paginator->getCollection()->map(fn (Guarantor $g) => $this->format($g))->values(),
            'meta' => ['total' => $paginator->total(), 'current_page' => $paginator->currentPage()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['required', 'string'],
            'last_name' => ['required', 'string'],
            'phone' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'id_type' => ['nullable', Rule::enum(IdType::class)],
            'id_number' => ['nullable', 'string'],
            'occupation' => ['nullable', 'string'],
            'employer' => ['nullable', 'string'],
            'monthly_income' => ['nullable', 'numeric', 'min:0'],
            'relationship_to_tenant' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            'metadata' => ['nullable', 'array'],
        ]);

        $guarantor = Guarantor::create(array_merge($data, [
            'added_by_id' => $request->user()->id,
        ]));

        return $this->json(['data' => $this->format($guarantor)], 201);
    }

    public function show(Request $request, Guarantor $guarantor): JsonResponse
    {
        $this->authorizeAccess($request, $guarantor);

        return $this->json(['data' => $this->format($guarantor)]);
    }

    public function update(Request $request, Guarantor $guarantor): JsonResponse
    {
        $this->authorizeAccess($request, $guarantor);

        $data = $request->validate([
            'first_name' => ['sometimes', 'string'],
            'last_name' => ['sometimes', 'string'],
            'phone' => ['sometimes', 'nullable', 'string'],
            'email' => ['sometimes', 'nullable', 'email'],
            'id_type' => ['sometimes', 'nullable', Rule::enum(IdType::class)],
            'id_number' => ['sometimes', 'nullable', 'string'],
            'occupation' => ['sometimes', 'nullable', 'string'],
            'employer' => ['sometimes', 'nullable', 'string'],
            'monthly_income' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'relationship_to_tenant' => ['sometimes', 'nullable', 'string'],
            'notes' => ['sometimes', 'nullable', 'string'],
        ]);

        $guarantor->fill($data)->save();

        return $this->json(['data' => $this->format($guarantor->refresh())]);
    }

    public function destroy(Request $request, Guarantor $guarantor): JsonResponse
    {
        $this->authorizeAccess($request, $guarantor);
        $guarantor->delete();

        return $this->json(null, 204);
    }

    protected function authorizeAccess(Request $request, Guarantor $guarantor): void
    {
        $user = $request->user();
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $guarantor->added_by_id === $user->id
            || ($user->agency_id && $guarantor->addedBy?->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    private function format(Guarantor $g): array
    {
        return [
            'id' => $g->id,
            'first_name' => $g->first_name,
            'last_name' => $g->last_name,
            'phone' => $g->phone,
            'email' => $g->email,
            'id_type' => $g->id_type?->value,
            'id_number' => $g->id_number,
            'occupation' => $g->occupation,
            'employer' => $g->employer,
            'monthly_income' => $g->monthly_income !== null ? (float) $g->monthly_income : null,
            'relationship_to_tenant' => $g->relationship_to_tenant,
            'notes' => $g->notes,
            'created_at' => $g->created_at?->toISOString(),
        ];
    }
}
