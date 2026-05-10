<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Invitation\InviteServiceProviderRequest;
use App\Http\Resources\InvitationResource;
use App\Models\Agency;
use App\Models\Profiles\ServiceProviderProfile;
use App\Services\Invitation\ServiceProviderInvitationService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;

/**
 * TCK-260 — `POST /api/agencies/{agency}/service-providers/invite`.
 *
 * Thin controller — toute la logique métier vit dans
 * {@see ServiceProviderInvitationService}. Le policy gate tourne avant
 * le service pour surfacer 403 avant d'écrire en base.
 *
 * La réponse expose deux flags utilisés par TCK-262 / TCK-261 :
 *  - `existing_sp_other_agency` : vrai si un SP existe déjà pour cet
 *    email dans une autre agence (la modale frontend propose un
 *    multi-rattachement à l'acceptation).
 *  - `existing_sp_same_agency` : toujours false ici car le service
 *    aurait déjà jeté 409 si un SP actif existait dans cette agence.
 *    Conservé dans la réponse pour symétrie front (le 409 le contient
 *    aussi).
 */
class ServiceProviderInvitationController extends Controller
{
    public function __construct(private readonly ServiceProviderInvitationService $service) {}

    public function __invoke(InviteServiceProviderRequest $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('invite', [ServiceProviderProfile::class, $agency])) {
            throw new AuthorizationException(__('service_providers.invite.errors.permission_denied'));
        }

        $result = $this->service->invite($agency, $user, $request->validated());

        return $this->json([
            'data' => InvitationResource::make($result['invitation'])->toArray($request),
            'meta' => [
                'existing_sp_other_agency' => $result['existing_sp_other_agency'],
                'existing_sp_same_agency' => $result['existing_sp_same_agency'],
                'service_provider_profile_id' => $result['profile']->id,
            ],
        ], 201);
    }
}
