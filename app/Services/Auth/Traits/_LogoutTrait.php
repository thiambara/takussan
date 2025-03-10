<?php

namespace App\Services\Auth\Traits;

trait _LogoutTrait
{

    public function logout(): bool
    {
        return auth()->user()->currentAccessToken()?->delete();
    }
}
