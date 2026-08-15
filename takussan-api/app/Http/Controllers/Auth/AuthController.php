<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Auth\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Auth\TwoFactorService;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(private readonly TwoFactorService $twoFactorService) {}

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

        return $this->json([
            'message' => __('auth.registration_successful'),
            'user' => new UserResource($user),
        ], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('email', $request->input('email'))->first();

        if (! $user || ! Hash::check($request->input('password'), $user->password)) {
            return $this->json(['message' => __('auth.failed')], 401);
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
                return $this->json([
                    'requires_2fa' => true,
                    'message' => __('auth.two_factor_invalid'),
                ], 401);
            }
        }

        Auth::setUser($user);
        $user->update(['last_login_at' => now()]);

        $tokenName = (string) ($request->input('device_name') ?: 'auth_token');
        $token = $user->createToken($tokenName)->plainTextToken;

        return $this->json([
            'token' => $token,
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

    public function updateProfile(UpdateProfileRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->only(['first_name', 'last_name', 'bio']);

        if ($request->has('phone')) {
            $newPhone = $request->input('phone');
            $newPhone = $newPhone === '' ? null : $newPhone;
            // TCK-137 — changer le numéro réinitialise le statut de vérification.
            // Le contrôleur fait foi (pas de cast model) pour rester explicite.
            if ($user->phone !== $newPhone) {
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

        return $this->json(new UserResource($user->fresh()));
    }
}
