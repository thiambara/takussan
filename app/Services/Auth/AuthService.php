<?php

namespace App\Services\Auth;

use App\Services\Auth\Traits\_LoginTrait;
use App\Services\Auth\Traits\_LogoutTrait;
use App\Services\Auth\Traits\_SignUpTrait;

class AuthService implements AuthServiceInterface
{
    use _LoginTrait, _LogoutTrait, _SignUpTrait;
}
