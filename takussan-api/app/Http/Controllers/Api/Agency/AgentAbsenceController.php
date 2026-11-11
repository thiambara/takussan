<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Agency\StoreAgentAbsenceRequest;
use App\Http\Requests\Agency\UpdateAgentAbsenceRequest;
use App\Models\Agency;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Agency\AgentAbsenceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-591 (ADR-0035) — les absences de l'agence : lister, déclarer, révoquer.
 *
 * TCK-2666 (ADR-0035, amendement du 2026-11-10) — et modifier ; chaque absence dit si son
 * remplaçant peut agir (`substitute_can_act` : une délégation liée en cours) et nomme sa dernière
 * délégation liée (`delegation_id`).
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
            ->with(['user:id,first_name,last_name,username', 'replaces:id,first_name,last_name,username', 'coverDelegation'])
            ->orderByDesc('ends_at')
            ->paginate(min(50, max(1, (int) $request->input('per_page', 20))));

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (RoleDelegation $a) => $this->format($a, $request->user()))->values()->all());
    }

    public function store(Agency $agency, StoreAgentAbsenceRequest $request): JsonResponse
    {
        $absence = $this->service->declare($agency, $request->user(), ['substitute_can_act' => $request->boolean('substitute_can_act')] + $request->validated());

        return $this->json(['data' => $this->format($absence->load(['user', 'replaces', 'coverDelegation']), $request->user())], 201);
    }

    public function update(Agency $agency, RoleDelegation $delegation, UpdateAgentAbsenceRequest $request): JsonResponse
    {
        $data = $request->validated();
        if ($request->has('substitute_can_act')) {
            $data['substitute_can_act'] = $request->boolean('substitute_can_act');
        }

        $absence = $this->service->update($delegation, $request->user(), $data);

        return $this->json(['data' => $this->format($absence->load(['user', 'replaces', 'coverDelegation']), $request->user())]);
    }

    public function destroy(Agency $agency, RoleDelegation $delegation, Request $request): JsonResponse
    {
        abort_unless($delegation->agency_id === $agency->id && $delegation->isAbsence(), 404);
        $this->authorize('revokeAbsence', $delegation);

        $this->service->revoke($delegation, $request->user());

        return $this->json(['data' => $this->format($delegation->refresh()->load(['user', 'replaces', 'coverDelegation']), $request->user())]);
    }

    /** @return array<string, mixed> */
    private function format(RoleDelegation $absence, User $viewer): array
    {
        // P235.02 (TCK-2369) — nom, puis `username`, puis « — » : jamais `''` ni `null` pour un compte sans nom.
        $person = fn ($u) => $u === null ? null : ['id' => $u->id, 'name' => $u->nameWithoutContact()];

        return [
            'id' => $absence->id,
            'absent' => $person($absence->replaces),
            'substitute' => $person($absence->user),
            'starts_at' => $this->instant($absence->starts_at),
            'ends_at' => $this->instant($absence->ends_at),
            'status' => $absence->status,
            // verif-591 m3 — qui couvre qui est une information de travail (ADR-0035) ; le POURQUOI
            // peut être une donnée de santé. Le motif ne va qu'à l'absent, à l'auteur et au
            // titulaire de `team.delegate_role` : la règle de `revokeAbsence`.
            'reason' => $viewer->can('revokeAbsence', $absence) ? $absence->reason : null,
            // TCK-2666 — le droit d'agir vient de la délégation liée EN COURS, jamais de l'absence.
            'substitute_can_act' => $absence->coverDelegation?->isLive() === true,
            'delegation_id' => $absence->coverDelegation?->id,
        ];
    }
}
