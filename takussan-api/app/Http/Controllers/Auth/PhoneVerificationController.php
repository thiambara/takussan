<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PhoneVerificationController extends Controller
{
    public function verify(Request $request): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        $user = $request->user();
        abort_if($user->phone_verified_at !== null, 422, 'Phone already verified.');

        // OTP verification logic goes here (integrate SMS provider).
        // For now we mark as verified if the user confirms the code.
        $user->update(['phone_verified_at' => now()]);

        return $this->json(['data' => ['verified' => true]]);
    }

    public function resend(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->phone_verified_at !== null, 422, 'Phone already verified.');
        abort_unless($user->phone !== null, 422, 'No phone number on file.');

        // Dispatch SMS OTP here via SMS provider.

        return $this->json(['data' => ['sent' => true]]);
    }
}
