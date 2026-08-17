<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreGuarantorRequest;
use App\Http\Requests\Api\UpdateGuarantorRequest;
use App\Models\Guarantor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GuarantorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $base = Guarantor::query();

        if (! $user->isSuperAdmin()) {
            $base->where('added_by_id', $user->id);
        }

        // lease_id filters via relationship (not a direct column)
        if ($leaseId = $request->input('lease_id')) {
            $base->whereHas('leases', fn ($q) => $q->where('id', $leaseId));
        }

        $paginator = Guarantor::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (Guarantor $g) => $this->format($g))->values());
    }

    public function store(StoreGuarantorRequest $request): JsonResponse
    {
        $data = $request->validated();

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

    public function update(UpdateGuarantorRequest $request, Guarantor $guarantor): JsonResponse
    {
        $this->authorizeAccess($request, $guarantor);

        $data = $request->validated();

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
        $ok = $user->isSuperAdmin()
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
