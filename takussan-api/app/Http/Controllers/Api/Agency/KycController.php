<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Kyc\UploadKycDocumentRequest;
use App\Http\Resources\KycDossierResource;
use App\Models\Agency;
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
        $this->authorizeAgencyAdmin($request, $agency);

        $dossier = $this->kyc->dossierForAgency($agency);
        $this->kyc->upload(
            $dossier,
            $request->file('document'),
            $request->string('document_type')->toString(),
        );

        return $this->json([
            'data' => (new KycDossierResource($dossier->refresh()))->resolve($request),
        ], 201);
    }

    public function submit(Request $request, Agency $agency): JsonResponse
    {
        $this->authorizeAgencyAdmin($request, $agency);

        $dossier = $this->kyc->submit($this->kyc->dossierForAgency($agency), $request->user());

        return $this->json([
            'data' => (new KycDossierResource($dossier))->resolve($request),
        ]);
    }

    private function authorizeAgencyAdmin(Request $request, Agency $agency): void
    {
        $user = $request->user();

        abort_unless(
            $user->isSuperAdmin()
            || (
                $request->activeProfile()?->agency_id === $agency->id
                && $user->hasRole('agency_admin')
            ),
            403,
        );
    }
}
