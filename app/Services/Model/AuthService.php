<?php

namespace App\Services\Model;

use App\Models\Bases\Enums\UserStatus;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthService
{

    public function signUp(array $userData): User
    {
        $userData = validator($userData, [
            'first_name' => 'required|string',
            'last_name' => 'required|string',
            'username' => 'required|unique:users',
            'email' => 'email|unique:users,email',
            'phone' => 'string|max:255',
            'roles' => 'required',
            'password' => 'required|string|max:255',
        ])->validate();
        $userData['password'] = Hash::make($userData['password']);
        $userData['status'] ??= UserStatus::ACTIVE;
        $user = User::create($userData);
        $user->save();
        return $user;
    }


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


    public function logout(): void
    {
        // logout user
        auth()->user()->currentAccessToken()?->delete();
    }


}
