<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Agency\StoreAgentAbsenceRequest;
use App\Models\Agency;
use App\Models\RoleDelegation;
use App\Services\Agency\AgentAbsenceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-591 (ADR-0035) — les absences de l'agence : lister, déclarer, révoquer.
 */
class AgentAbsenceController extends Controller
{
    public function __construct(private readonly AgentAbsenceService $service) {}

    public function index(Agency $agency, Request $request): JsonResponse
    {
        $this->authorize('viewAbsences', [RoleDelegation::class, $agency]);

        $paginator = RoleDelegation::query()
            ->absences()
            ->where('agency_id', $agency->id)
            ->when($request->boolean('current'), fn ($q) => $q->whereIn('status', ['scheduled', 'active']))
            ->with(['user:id,first_name,last_name', 'replaces:id,first_name,last_name'])
            ->orderByDesc('ends_at')
            ->paginate(min(50, max(1, (int) $request->input('per_page', 20))));

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (RoleDelegation $a) => $this->format($a))->values()->all());
    }

    public function store(Agency $agency, StoreAgentAbsenceRequest $request): JsonResponse
    {
        $absence = $this->service->declare($agency, $request->user(), $request->validated());

        return $this->json(['data' => $this->format($absence->load(['user', 'replaces']))], 201);
    }

    public function destroy(Agency $agency, RoleDelegation $delegation, Request $request): JsonResponse
    {
        abort_unless($delegation->agency_id === $agency->id && $delegation->isAbsence(), 404);
        $this->authorize('revokeAbsence', $delegation);

        $this->service->revoke($delegation, $request->user());

        return $this->json(['data' => $this->format($delegation->refresh()->load(['user', 'replaces']))]);
    }

    /** @return array<string, mixed> */
    private function format(RoleDelegation $absence): array
    {
        $person = fn ($u) => $u === null ? null : ['id' => $u->id, 'name' => trim($u->first_name.' '.$u->last_name)];

        return [
            'id' => $absence->id,
            'absent' => $person($absence->replaces),
            'substitute' => $person($absence->user),
            'starts_at' => $absence->starts_at?->toIso8601String(),
            'ends_at' => $absence->ends_at?->toIso8601String(),
            'status' => $absence->status,
            'reason' => $absence->reason,
        ];
    }
}
