<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Invitation\AcceptInvitationRequest;
use App\Http\Resources\InvitationResource;
use App\Services\Invitation\InvitationService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * TCK-249 — public accept endpoint.
 *
 * Mounted *outside* the `auth:sanctum` group so unauthenticated invitees
 * can complete onboarding directly from the email link. The token in the
 * URL is the bearer credential.
 *
 * Two flows:
 *  - Email maps to no User → service creates the User in a transaction,
 *    attaches the spatie role, flips the profile, returns 200.
 *  - Email maps to an existing User → service throws 401 with custom
 *    headers (`X-Invitation-Email`, `X-Invitation-Requires-Login`). The
 *    frontend catches this, prompts the user to log in, then re-hits
 *    the same endpoint with their bearer token.
 */
class InvitationAcceptController extends Controller
{
    public function __construct(private readonly InvitationService $service) {}

    public function __invoke(string $token, AcceptInvitationRequest $request): JsonResponse
    {
        $user = $request->user();

        try {
            $invitation = $this->service->accept(
                token: $token,
                payload: $request->validated(),
                authenticated: $user,
            );
        } catch (HttpException $e) {
            // Translate the service's "requires_login" 401 into a JSON
            // body the frontend can dispatch on without parsing headers.
            if ($e->getStatusCode() === 401) {
                $headers = $e->getHeaders();
                $email = $headers['X-Invitation-Email'] ?? null;

                return $this->json([
                    'message' => $e->getMessage(),
                    'requires_login' => true,
                    'email' => $email,
                ], 401, $headers);
            }

            throw $e;
        }

        return $this->json([
            'data' => InvitationResource::make($invitation)->toArray($request),
        ]);
    }
}
