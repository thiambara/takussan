<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Auth\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Auth\AuthRefusal;
use App\Services\Auth\LoginLock;
use App\Services\Auth\PhoneChangeGuard;
use App\Services\Auth\SessionTokenIssuer;
use App\Services\Auth\TwoFactorService;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(
        private readonly TwoFactorService $twoFactorService,
        private readonly SessionTokenIssuer $tokens,
        private readonly LoginLock $lock,
    ) {}

    public function register(RegisterRequest $request): JsonResponse
    {
        $user = User::create([
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'email' => $request->email,
            'password' => $request->password,
        ]);

        // TCK-272 — ce mot de passe a été CHOISI par l'utilisateur, il le
        // connaît : le step-up de suppression de compte peut le lui
        // redemander. Les mots de passe machine (OAuth, invitation sans mot
        // de passe, provisioning) laissent volontairement ce champ à NULL.
        $user->markPasswordAsSet();

        event(new Registered($user));

        // TCK-589 (4.2) — l'inscription CONNECTE. `a4c01808` avait retiré le jeton
        // (« user must verify email first »), mais aucune route n'exige
        // `email_verified_at` et le même compte se connectait aussitôt par
        // `/auth/login` : le front appelait `openSession(undefined, …)` et
        // `set-token` sans jeton EFFAÇAIT le cookie.
        $issued = $this->tokens->issue($user, 'auth_token');

        return $this->json([
            'message' => __('auth.registration_successful'),
            'token' => $issued['token'],
            'expires_at' => $issued['expires_at']->toIso8601String(),
            'user' => new UserResource($user),
        ], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('email', $request->input('email'))->first();

        // TCK-589 (contrainte 5 bis) — le verrou se lit AVANT le mot de passe :
        // le bon mot de passe n'y échappe pas.
        // Vérification adverse m3 — une adresse inconnue a son compteur leurre : même seuil,
        // même 423. Le verrou ne dit plus si une adresse est inscrite.
        $email = (string) $request->input('email');
        if ($user ? $this->lock->isLocked($user) : $this->lock->isUnknownEmailLocked($email)) {
            return AuthRefusal::response(423, 'account_locked', 'auth.account.locked');
        }

        if (! $user || ! Hash::check($request->input('password'), $user->password)) {
            $user
                ? $this->lock->recordFailure($user)
                : $this->lock->recordUnknownEmailFailure($email);

            return $this->json(['message' => __('auth.failed')], 401);
        }

        // TCK-589 (4.1) — un compte bloqué ne se reconnecte plus. Jugé APRÈS le mot
        // de passe : le statut d'un compte ne se révèle qu'à qui en a le secret.
        if (! $user->canOpenSession()) {
            return AuthRefusal::response(403, 'account_blocked', 'auth.account.blocked');
        }

        // Password OK — challenge for 2FA if enabled. The caller must repost
        // with either a valid TOTP code or a single-use recovery code.
        if ($user->two_factor_enabled) {
            $code = $request->input('two_factor_code');
            $recovery = $request->input('recovery_code');

            if (! $code && ! $recovery) {
                return $this->json([
                    'requires_2fa' => true,
                    'message' => __('auth.two_factor_required'),
                ], 200);
            }

            $authorized = false;
            if ($code) {
                // verifyCodeForUser enforces single-use: a code already
                // accepted within the ±30 s window cannot be replayed.
                $authorized = $this->twoFactorService->verifyCodeForUser(
                    $user,
                    $user->two_factor_secret,
                    (string) $code,
                );
            }
            if (! $authorized && $recovery) {
                $authorized = $this->twoFactorService->verifyRecoveryCode($user, (string) $recovery);
            }

            if (! $authorized) {
                $this->lock->recordFailure($user);

                return $this->json([
                    'requires_2fa' => true,
                    'message' => __('auth.two_factor_invalid'),
                ], 401);
            }
        }

        $this->lock->clear($user);
        Auth::setUser($user);
        $user->update(['last_login_at' => now()]);

        $tokenName = (string) ($request->input('device_name') ?: 'auth_token');
        // Un TOTP vient d'être saisi : le jeton naît avec un step-up de 10 min.
        $issued = $this->tokens->issue($user, $tokenName, twoFactorJustVerified: (bool) $user->two_factor_enabled);

        return $this->json([
            'token' => $issued['token'],
            'expires_at' => $issued['expires_at']->toIso8601String(),
            'user' => new UserResource($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        // Expire the active-profile cookie so a subsequent login on a shared
        // device doesn't inherit the previous user's selection (and so the
        // next anonymous request to backend stops carrying it around).
        return $this->json(['message' => __('auth.logout_successful')])
            ->withCookie(Cookie::forget('active_profile_id'));
    }

    public function me(Request $request): JsonResponse
    {
        return $this->json(new UserResource($request->user()));
    }

    public function updateProfile(UpdateProfileRequest $request, PhoneChangeGuard $phoneChange): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->only(['first_name', 'last_name', 'bio']);
        if (array_key_exists('last_name', $data)) {
            $data['last_name'] = (string) $data['last_name'];
        }
        $remplace = null;

        if ($request->has('phone')) {
            $newPhone = $request->input('phone');
            $newPhone = $newPhone === '' ? null : $newPhone;
            // TCK-137 — changer le numéro réinitialise le statut de vérification.
            // Le contrôleur fait foi (pas de cast model) pour rester explicite.
            if ($user->phone !== $newPhone) {
                // TCK-589 p3-1 — remplacer (ou retirer) un numéro VÉRIFIÉ exige une preuve
                // sur le facteur en place ; rien n'est écrit sans elle.
                if ($phoneChange->replacesVerified($user, $newPhone)) {
                    $phoneChange->authorize($request, $user);
                    $remplace = (string) $user->phone;
                }
                $data['phone'] = $newPhone;
                $data['phone_verified_at'] = null;
            }
        }

        if ($request->boolean('avatar_remove')) {
            $user->clearMediaCollection('avatar');
        }

        if ($request->hasFile('avatar')) {
            $user
                ->addMediaFromRequest('avatar')
                ->toMediaCollection('avatar');
        }

        $user->update($data);
        if ($remplace !== null) {
            $phoneChange->notifyReplaced($user, $remplace);
        }

        return $this->json(new UserResource($user->fresh()));
    }
}
