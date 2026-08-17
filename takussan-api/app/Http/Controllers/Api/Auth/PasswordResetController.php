<?php

namespace App\Http\Controllers\Api\Auth;

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
        $request->merge(['email' => strtolower(trim($request->input('email')))]);

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

        $data = $request->only('email', 'password', 'password_confirmation', 'token');
        $data['email'] = strtolower(trim($data['email']));

        $status = Password::reset(
            $data,
            function ($user, string $password) {
                // TCK-272 — `password_set_at` marque un mot de passe CHOISI.
                // C'est le seul chemin par lequel un compte provisionné
                // (OAuth, invitation, plateforme) acquiert un mot de passe
                // qu'il connaît : il repasse donc sur le step-up par mot de
                // passe dès ce reset.
                $user->forceFill([
                    'password' => Hash::make($password),
                    'password_set_at' => now(),
                ])->save();
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
