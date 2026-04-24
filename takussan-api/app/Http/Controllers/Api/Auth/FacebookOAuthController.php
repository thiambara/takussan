<?php

namespace App\Http\Controllers\Api\Auth;

/**
 * Facebook OAuth — TCK-081.
 *
 * Facebook's `email_verified` claim is not reliably populated for every
 * account (especially for users who signed up via SMS). We therefore
 * treat the email as unverified on first sign-in and rely on the
 * standard verification email dispatched by the Registered event.
 */
class FacebookOAuthController extends AbstractOAuthController
{
    protected function provider(): string
    {
        return 'facebook';
    }

    protected function markEmailVerified(): bool
    {
        return false;
    }
}
