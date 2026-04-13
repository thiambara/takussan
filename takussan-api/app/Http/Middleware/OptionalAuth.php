<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate;

class OptionalAuth extends Authenticate
{
    protected function unauthenticated($request, array $guards)
    {
        // do nothing, but set the default guard through parent `authenticate` method...
    }
}
