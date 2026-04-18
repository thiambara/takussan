<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules;

class PasswordResetController extends Controller
{
    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        Password::sendResetLink($request->only('email'));

        return $this->json(['message' => 'If an account with that email exists, a password reset link has been sent.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function ($user, string $password) {
                $user->forceFill(['password' => Hash::make($password)])->save();
                // Revoke all tokens on password reset
                $user->tokens()->delete();
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return $this->json(['message' => __($status)]);
        }

        return $this->json(['message' => __($status)], 422);
    }
}
