<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Kyc\RejectKycDossierRequest;
use App\Http\Resources\KycDossierResource;
use App\Models\Agency;
use App\Models\KycDossier;
use App\Services\Kyc\KycWorkflowService;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KycController extends Controller
{
    public function __construct(
        private readonly KycWorkflowService $kyc,
        private readonly PersonalDataAccessLogger $accessLog,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $perPage = max(1, min((int) $request->query('per_page', 15), 100));
        $dossiers = KycDossier::buildQuery(request: $request)
            ->with(['subject', 'reviewer'])
            ->defaultSort('submitted_at')
            ->paginate($perPage);

        return $this->paginated($dossiers, KycDossierResource::collection($dossiers)->resolve($request));
    }

    public function agency(Request $request, Agency $agency): JsonResponse
    {
        $dossier = $this->kyc->dossierForAgency($agency);
        // TCK-601 (ADR-0044 §4) — un dossier KYC ouvert depuis la console est une consultation.
        $this->accessLog->record($request->user(), $dossier, PersonalDataAccessLogger::SURFACE_KYC_DOSSIER);

        return $this->json([
            'data' => (new KycDossierResource($dossier))->resolve($request),
        ]);
    }

    public function show(Request $request, KycDossier $dossier): JsonResponse
    {
        $this->accessLog->record($request->user(), $dossier, PersonalDataAccessLogger::SURFACE_KYC_DOSSIER);

        return $this->json([
            'data' => (new KycDossierResource($dossier->load(['subject', 'reviewer'])))->resolve($request),
        ]);
    }

    public function verify(Request $request, KycDossier $dossier): JsonResponse
    {
        $dossier = $this->kyc->verify($dossier, $request->user());

        return $this->json([
            'data' => (new KycDossierResource($dossier))->resolve($request),
        ]);
    }

    public function reject(RejectKycDossierRequest $request, KycDossier $dossier): JsonResponse
    {
        $dossier = $this->kyc->reject($dossier, $request->user(), $request->string('reason')->toString());

        return $this->json([
            'data' => (new KycDossierResource($dossier))->resolve($request),
        ]);
    }
}
