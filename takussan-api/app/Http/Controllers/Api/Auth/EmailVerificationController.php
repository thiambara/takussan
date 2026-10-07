<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use Illuminate\Auth\Events\Verified;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmailVerificationController extends Controller
{
    public function verify(EmailVerificationRequest $request): JsonResponse
    {
        if ($request->user()->hasVerifiedEmail()) {
            return $this->json(['message' => __('messages.email_already_verified')]);
        }

        if ($request->user()->markEmailAsVerified()) {
            event(new Verified($request->user()));
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
