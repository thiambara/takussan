<?php

namespace App\Http\Controllers\auth;

use App\Http\Controllers\base\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function authUser(Request $request)
    {
        return response()->json($request->user());
    }

    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::whereUsername($request->username)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'username' => ['The provided credentials are incorrect.'],
            ]);
        }

        $token = $user->createToken($request->ip(), expiresAt: now()->addMonths(3));

        $responseData = [
            'access_token' => $token->plainTextToken,
            'expires_in' => $token->accessToken->expires_at->diffInSeconds(now()),
        ];

        return $this->json($responseData);
    }

    public function logout()
    {
        // logout user
        auth()->user()->currentAccessToken()?->delete();
        return $this->json(['message' => 'Logged out']);

    }

}
