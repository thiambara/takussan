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

        event(new Registered($user));

        return $this->json([
            'message' => 'Registration successful. Please verify your email.',
            'user' => new UserResource($user),
        ], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('email', $request->input('email'))->first();

        if (! $user || ! Hash::check($request->input('password'), $user->password)) {
            return $this->json(['message' => 'Invalid credentials.'], 401);
        }

        // Password OK — challenge for 2FA if enabled. The caller must repost
        // with either a valid TOTP code or a single-use recovery code.
        if ($user->two_factor_enabled) {
            $code = $request->input('two_factor_code');
            $recovery = $request->input('recovery_code');

            if (! $code && ! $recovery) {
                return $this->json([
                    'requires_2fa' => true,
                    'message' => 'Two-factor authentication required.',
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
                    'message' => 'Invalid two-factor or recovery code.',
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

        return $this->json(['message' => 'Logged out successfully.']);
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

        if ($request->hasFile('avatar')) {
            $path = $request->file('avatar')->store('avatars', 'public');
            $data['metadata'] = array_merge($user->metadata ?? [], ['avatar' => $path]);
        }

        $user->update($data);

        return $this->json(new UserResource($user->fresh()));
    }
}
