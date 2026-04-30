<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PhoneVerificationController extends Controller
{
    public function __construct(private readonly PhoneVerificationService $service) {}

    public function verify(Request $request): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        $user = $request->user();
        abort_if($user->phone_verified_at !== null, 422, 'Phone already verified.');
        abort_unless($user->phone !== null, 422, 'No phone number on file.');

        abort_unless(
            $this->service->verifyOtp($user, $request->input('code')),
            422,
            'Invalid or expired verification code.',
        );

        $user->forceFill(['phone_verified_at' => now()])->save();

        return $this->json(['data' => ['verified' => true]]);
    }

    public function resend(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->phone_verified_at !== null, 422, 'Phone already verified.');
        abort_unless($user->phone !== null, 422, 'No phone number on file.');
        abort_unless(
            $this->service->canResend($user),
            429,
            'Please wait before requesting another code.',
        );

        $debugCode = $this->service->sendOtp($user);

        $payload = ['sent' => true];
        if ($debugCode !== null) {
            // Only leaked outside production — useful for Feature tests & dev.
            $payload['debug_code'] = $debugCode;
        }

        return $this->json(['data' => $payload]);
    }
}
