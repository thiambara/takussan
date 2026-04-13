<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class OAuth2Controller extends Controller
{

    public function googleRedirect(): JsonResponse
    {
        return $this->json(['redirect_url' => Socialite::driver('google')->stateless()->redirect()->getTargetUrl()]);
    }

    public function googleCallback(): JsonResponse
    {
        $googleUser = Socialite::driver('google')->stateless()?->user();

        $user = User::whereGoogleId($googleUser->id)->first();
        if (!$user) {
            $user = new User();
            $user->google_id = $googleUser->getId();
            $user->username = $googleUser->getEmail();
            $user->first_name = $googleUser->getName();
            $user->email = $googleUser->getEmail();
            $user->password = Hash::make(Str::random(8));
            $user->save();
        }
        return $this->json($user->createToken('Token Name')->toArray());
    }

}
