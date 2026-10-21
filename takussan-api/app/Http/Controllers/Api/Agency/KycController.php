<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Kyc\UploadKycDocumentRequest;
use App\Http\Resources\KycDossierResource;
use App\Models\Agency;
use App\Policies\AgencyPolicy;
use App\Services\Kyc\KycWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KycController extends Controller
{
    public function __construct(private readonly KycWorkflowService $kyc) {}

    public function show(Request $request, Agency $agency): JsonResponse
    {
        $this->authorizeAgencyAdmin($request, $agency);

        return $this->json([
            'data' => (new KycDossierResource($this->kyc->dossierForAgency($agency)))->resolve($request),
        ]);
    }

    public function upload(UploadKycDocumentRequest $request, Agency $agency): JsonResponse
    {
        // TCK-601 (C) — par la capacité `agency.update_kyc` ({@see AgencyPolicy::updateKyc()}).
        $this->authorize('updateKyc', $agency);

        $dossier = $this->kyc->dossierForAgency($agency);
        $this->kyc->upload(
            $dossier,
            $request->file('document'),
            $request->string('document_type')->toString(),
            $request->validated('expires_at'),
        );

        return $this->json([
            'data' => (new KycDossierResource($dossier->refresh()))->resolve($request),
        ], 201);
    }

    public function submit(Request $request, Agency $agency): JsonResponse
    {
        // TCK-601 (C) — par la capacité `agency.update_kyc` ({@see AgencyPolicy::updateKyc()}).
        $this->authorize('updateKyc', $agency);

        $dossier = $this->kyc->submit($this->kyc->dossierForAgency($agency), $request->user());

        return $this->json([
            'data' => (new KycDossierResource($dossier))->resolve($request),
        ]);
    }

    /**
     * TCK-1148 (P82.05) — lire le dossier se juge par la règle du dépôt et de la soumission,
     * {@see AgencyPolicy::updateKyc()} : le membre qui tient `agency.update_kyc` lit ce qu'il
     * soumet, l'admin dont le rôle la retire ne le lit plus. Le helper n'est plus qu'un relais :
     * `scripts/check-controller-authorization.mjs` porte une exemption à son nom, qui rougit si la
     * méthode disparaît.
     */
    private function authorizeAgencyAdmin(Request $request, Agency $agency): void
    {
        $this->authorize('updateKyc', $agency);
    }
}
