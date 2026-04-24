<?php

return [

    'salutation' => 'The Takussan team',

    'registration' => [
        'subject' => 'Confirm your email address',
        'greeting' => 'Welcome to Takussan!',
        'intro' => 'Please confirm your email address by clicking the button below.',
        'action' => 'Verify email',
        'expire' => 'This verification link will expire in :count minutes.',
        'ignore' => 'If you did not create an account, no further action is required.',
    ],

    'password_reset' => [
        'subject' => 'Reset your password',
        'greeting' => 'Hello!',
        'intro' => 'You are receiving this email because we received a password reset request for your account.',
        'action' => 'Reset password',
        'expire' => 'This password reset link will expire in :count minutes.',
        'ignore' => 'If you did not request a password reset, no further action is required.',
    ],

    'new_booking' => [
        'subject' => 'New booking #:reference',
        'greeting' => 'Hello,',
        'intro' => 'Your booking #:reference has been created and is now pending confirmation.',
        'details' => 'Stay: from :start to :end.',
    ],

    'digest' => [
        'subject' => 'Your Takussan digest (:count new)',
        'greeting' => 'Hello,',
        'intro' => 'Here is a summary of the notifications you received since yesterday.',
        'footer' => 'Visit the notification center to see all your alerts.',
    ],

    'visit_requested' => [
        'subject' => 'New visit request for :property',
        'greeting' => 'Hello,',
        'intro' => 'A visitor has requested a visit for :property.',
        'schedule' => 'Requested slot: :datetime.',
    ],

    'visit_confirmed' => [
        'subject' => 'Visit confirmed for :property',
        'greeting' => 'Hello,',
        'intro' => 'Your visit request for :property has been confirmed.',
        'schedule' => 'Scheduled for: :datetime.',
    ],

    'visit_reminder' => [
        'subject' => 'Reminder: upcoming visit for :property',
        'greeting' => 'Hello,',
        'intro_24h' => 'Reminder — your visit for :property is scheduled tomorrow at :datetime.',
        'intro_1h' => 'Reminder — your visit for :property starts in about an hour at :datetime.',
    ],
];
