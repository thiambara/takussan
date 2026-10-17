<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\ForgotPasswordPasswordResetRequest;
use App\Http\Requests\Auth\ResetPasswordPasswordResetRequest;
use App\Models\User;
use App\Support\CaseInsensitive;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;

class PasswordResetController extends Controller
{
    public function forgotPassword(ForgotPasswordPasswordResetRequest $request): JsonResponse
    {
        $request->merge(['email' => CaseInsensitive::fold(trim((string) $request->input('email')))]);

        Password::sendResetLink($request->only('email'));

        return $this->json(['message' => __('messages.password_reset_link_sent')]);
    }

    public function resetPassword(ResetPasswordPasswordResetRequest $request): JsonResponse
    {

        $data = $request->only('email', 'password', 'password_confirmation', 'token');
        $data['email'] = CaseInsensitive::fold(trim((string) $data['email']));

        $status = Password::broker($this->jeuDeJetons($request->boolean('activation'), $data['email']))->reset(
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

    /**
     * TCK-781 (P15.07) — le lien d'activation du gérant provisionné porte `activation=1` et vaut
     * 7 jours (`auth.passwords.activations`). Ce jeu de jetons ne juge que le jeton d'un compte
     * qui n'a jamais choisi de mot de passe : présenté par un compte qui en a un, le drapeau ne
     * fait pas vivre une réinitialisation ordinaire au-delà de ses 60 minutes. `null` : le jeu
     * par défaut.
     */
    private function jeuDeJetons(bool $activation, string $email): ?string
    {
        if ($activation) {
            $user = User::query()->where('email', $email)->first();
            if ($user !== null && ! $user->hasUsablePassword()) {
                return 'activations';
            }
        }

        return null;
    }
}
