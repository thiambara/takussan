<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class OAuthController extends Controller
{
    public function redirectToGoogle(Request $request): JsonResponse
    {
        $state = Str::random(40);
        $params = http_build_query([
            'client_id' => config('services.google.client_id'),
            'redirect_uri' => config('services.google.redirect'),
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
        ]);

        return $this->json([
            'data' => ['redirect_url' => 'https://accounts.google.com/o/oauth2/auth?'.$params],
        ]);
    }

    public function handleGoogleCallback(Request $request): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string'],
        ]);

        $tokenResponse = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'code' => $request->input('code'),
            'client_id' => config('services.google.client_id'),
            'client_secret' => config('services.google.client_secret'),
            'redirect_uri' => config('services.google.redirect'),
            'grant_type' => 'authorization_code',
        ]);

        abort_unless($tokenResponse->successful(), 422, 'OAuth token exchange failed.');

        $userInfo = Http::withToken($tokenResponse->json('access_token'))
            ->get('https://www.googleapis.com/oauth2/v3/userinfo')
            ->json();

        $user = User::where('google_id', $userInfo['sub'])
            ->orWhere('email', $userInfo['email'])
            ->first();

        if ($user === null) {
            $nameParts = explode(' ', $userInfo['name'] ?? '', 2);
            $user = User::create([
                'first_name' => $nameParts[0] ?? '',
                'last_name' => $nameParts[1] ?? '',
                'email' => $userInfo['email'],
                'google_id' => $userInfo['sub'],
                'email_verified_at' => now(),
                'password' => bcrypt(Str::random(32)),
            ]);
        } else {
            $user->update(['google_id' => $userInfo['sub']]);
        }

        $token = $user->createToken('google-oauth')->plainTextToken;

        return $this->json(['data' => ['token' => $token, 'user' => ['id' => $user->id, 'email' => $user->email]]]);
    }
}
