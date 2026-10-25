<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Invitation\InvitationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * P220.07 (TCK-2281) — `GET /api/invitations/{token}/prefill`.
 *
 * L'écran d'acceptation d'un compte connecté ne connaît pas l'invitation : cette lecture lui rend
 * le prénom et le nom que l'agence a saisis, à préremplir quand le compte est sans nom, que la
 * personne confirme ou corrige. `data: null` dans tout autre cas ({@see InvitationService::prefillFor()}).
 */
class InvitationPrefillController extends Controller
{
    public function __construct(private readonly InvitationService $service) {}

    public function __invoke(Request $request, string $token): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        return $this->json(['data' => $this->service->prefillFor($token, $user)]);
    }
}
