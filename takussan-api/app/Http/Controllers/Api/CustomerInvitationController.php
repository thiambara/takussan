<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\InviteCustomerRequest;
use App\Http\Resources\InvitationResource;
use App\Models\Customer;
use App\Services\Crm\CustomerInvitationService;
use Illuminate\Http\JsonResponse;

/**
 * P15.01 (TCK-2351) — `POST /api/customers/{customer}/invite` : inviter le client de la fiche à
 * créer son compte. Relance et révocation passent par les routes génériques
 * `/api/invitations/{id}/*`, comme pour le bailleur.
 */
class CustomerInvitationController extends Controller
{
    public function __construct(private readonly CustomerInvitationService $service) {}

    public function __invoke(InviteCustomerRequest $request, Customer $customer): JsonResponse
    {
        $invitation = $this->service->invite($customer, $request->user());

        return $this->json(
            ['data' => InvitationResource::make($invitation)->resolve($request)],
            201,
        );
    }
}
