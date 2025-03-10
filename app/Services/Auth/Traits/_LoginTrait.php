<?php

namespace App\Services\Auth\Traits;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

trait _LoginTrait
{
    public function login(string $identifier, string $password): array
    {
        $user = User::whereUsername($identifier)->first();

        if (!$user || !Hash::check($password, $user->password)) {
            throw ValidationException::withMessages([
                'username' => ['The provided credentials are incorrect.'],
            ]);
        }

        $token = $user->createToken(request()->ip(), expiresAt: now()->addMonths(3));

        return [
            'access_token' => $token->plainTextToken,
            'expires_in' => now()->diffInSeconds($token->accessToken->expires_at),
        ];
    }
}
