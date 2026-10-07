<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Authentication Language Lines (EN)
|--------------------------------------------------------------------------
*/

return [
    'failed' => 'These credentials do not match our records.',
    'password' => 'The provided password is incorrect.',
    'throttle' => 'Too many attempts. Please try again in :seconds seconds.',
    'registration_successful' => 'Registration successful. Please verify your email.',
    'logout_successful' => 'Logged out successfully.',
    'two_factor_required' => 'Two-factor authentication required.',
    'two_factor_invalid' => 'Invalid two-factor or recovery code.',
    // TCK-589 — phone sign-in, lockout, sessions, required 2FA (additions only).
    'phone' => [
        'sms_code' => 'Takussan: your code is :code. It expires in :minutes min. Do not share it.',
        'taken' => 'This number is already verified on another account.',
        'code_invalid' => 'Invalid or expired code.',
        'already_verified' => 'This number is already verified.',
        'missing' => 'No phone number on file.',
        'resend_wait' => 'Please wait before requesting another code.',
        'code_sent' => 'If this number can receive a text message, a code has just been sent to it.',
        'deletion_code' => 'Takussan: your account deletion confirmation code is :code. It expires in :minutes min.',
    ],
    'account' => [
        'blocked' => 'This account is blocked.',
        'locked' => 'Too many failed attempts. The account is locked for a few minutes.',
    ],
    'two_factor' => [
        'required' => 'Turn on two-factor authentication to continue: this is a sensitive operation.',
        'step_up_required' => 'Confirm with your two-factor code to continue.',
        'step_up_invalid' => 'Invalid two-factor code.',
        'mandatory' => 'Two-factor authentication is mandatory for your account: it can be renewed, not turned off.',
        'not_enabled' => 'Two-factor authentication is not enabled.',
        'renewal_missing' => 'Start by generating a new secret (device renewal).',
    ],
];
