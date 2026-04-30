<?php

namespace App\Http\Controllers\Auth;

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
            return $this->json(['message' => 'Email already verified.']);
        }

        if ($request->user()->markEmailAsVerified()) {
            event(new Verified($request->user()));
        }

        return $this->json(['message' => 'Email verified successfully.']);
    }

    public function resend(Request $request): JsonResponse
    {
        if ($request->user()->hasVerifiedEmail()) {
            return $this->json(['message' => 'Email already verified.'], 422);
        }

        $request->user()->sendEmailVerificationNotification();

        return $this->json(['message' => 'Verification email resent.']);
    }
}
