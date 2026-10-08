<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\SignLeaseRequest;
use App\Http\Resources\LeaseResource;
use App\Models\Lease;
use App\Services\Lease\LeaseSignatureService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-596 §4B (ADR-0042) — la signature d'un bail par code : le gestionnaire fige le contrat, chaque
 * partie reçoit puis saisit son code, la seconde signature active le bail.
 */
class LeaseSignatureController extends Controller
{
    public function __construct(private readonly LeaseSignatureService $signatures) {}

    public function request(Request $request, Lease $lease): JsonResponse
    {
        $this->authorize('requestSignature', $lease);

        $lease = $this->signatures->request($lease, $request->user());

        return $this->json(['data' => $this->detail($lease, $request)]);
    }

    public function sendCode(SignLeaseRequest $request, Lease $lease): JsonResponse
    {
        $sent = $this->signatures->sendCode($lease, $request->user(), $request->validated('role'));

        return $this->json(['data' => $sent], 202);
    }

    public function sign(SignLeaseRequest $request, Lease $lease): JsonResponse
    {
        $data = $request->validated();
        $lease = $this->signatures->sign($lease, $request->user(), $data['role'], $data['code'], $request);

        return $this->json(['data' => $this->detail($lease, $request)]);
    }

    /** @return array<string, mixed> */
    private function detail(Lease $lease, Request $request): array
    {
        return LeaseResource::make($lease->load(['property.address', 'tenant', 'signatures.signer', 'signatures.onBehalfOf']))
            ->forViewer($request->user())
            ->toArray($request);
    }
}
