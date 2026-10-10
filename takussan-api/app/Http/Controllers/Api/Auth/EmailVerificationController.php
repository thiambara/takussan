<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\VerifyEmailLinkRequest;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmailVerificationController extends Controller
{
    /** TCK-624 — le compte vient du lien signé, pas de la session (cf. `VerifyEmailLinkRequest`). */
    public function verify(VerifyEmailLinkRequest $request): JsonResponse
    {
        $user = $request->target();

        if ($user->hasVerifiedEmail()) {
            return $this->json(['message' => __('messages.email_already_verified')]);
        }

        if ($user->markEmailAsVerified()) {
            event(new Verified($user));
        }

        return $this->json(['message' => __('messages.email_verified')]);
    }

    public function resend(Request $request): JsonResponse
    {
        if ($request->user()->hasVerifiedEmail()) {
            abort_code(422, 'email.already_verified');
        }

        $request->user()->sendEmailVerificationNotification();

        return $this->json(['message' => __('messages.verification_email_resent')]);
    }
}
