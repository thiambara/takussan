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

    'task_due_reminder' => [
        'subject' => 'Reminder: task due soon — :title',
        'greeting' => 'Hello,',
        'intro' => 'Your task ":title" is due tomorrow at :datetime.',
    ],

    'lease_late_fee_applied' => [
        'subject' => 'Late fee applied on payment :reference',
        'greeting' => 'Hello,',
        'intro' => 'A late fee of :amount :currency has been applied to payment :reference.',
        'details' => 'Computed at :percent% of the remaining balance (:base :currency).',
    ],

    'account_deletion_requested' => [
        'subject' => 'Account deletion request received',
        'greeting' => 'Hello,',
        'intro' => 'We have registered your account deletion request. It will be executed on :date.',
        'consequences' => 'Your personal data will be irreversibly anonymized. Accounting and legal records (payments, leases, invoices) will be retained anonymously in accordance with applicable law.',
        'action' => 'Cancel deletion',
        'ignore' => 'If you did not initiate this request, cancel it immediately and change your password.',
    ],

    'account_deletion_reminder' => [
        'subject' => 'Reminder: account deletion in :days days',
        'greeting' => 'Hello,',
        'intro' => 'Your account will be deleted in :days days, on :date. If you change your mind, you can still cancel the deletion.',
        'action' => 'Cancel deletion',
        'ignore' => 'If you confirm the deletion, no further action is required.',
    ],

    'account_deletion_executed' => [
        'subject' => 'Your account has been deleted',
        'greeting' => 'Hello,',
        'intro' => 'Your Takussan account has been deleted and your personal data has been irreversibly anonymized.',
        'retention' => 'In accordance with legal obligations, certain accounting records (payments, invoices) are kept anonymously for 10 years.',
        'contact' => 'For any questions, please contact our support team.',
    ],

    'conversation_invite' => [
        'subject' => 'Group invite: :subject',
        'greeting' => 'Hello,',
        'intro' => ':inviter has added you to the group ":subject".',
    ],

    'lease_deposit_refunded' => [
        'subject' => 'Deposit refund — lease :reference',
        'greeting' => 'Hello,',
        'intro' => 'Your deposit for lease :reference has been refunded — :amount :currency.',
        'retention' => 'A retention of :amount :currency has been applied. Reason: :reason.',
    ],

    'lease_renewed' => [
        'subject' => 'Your lease has been renewed — :reference',
        'greeting' => 'Hello,',
        'intro' => 'An amendment has been created for your lease (:reference). The new terms now apply.',
        'period' => 'Period: from :start to :end.',
    ],

    'lease_early_termination' => [
        'greeting' => 'Hello,',
        'penalty_line' => 'Early termination penalty: :amount :currency. Due before the effective date.',
        'requested' => [
            'subject' => 'Early termination requested — lease :reference',
            'intro' => 'An early termination has been requested on lease :reference. Effective date: :date.',
        ],
        'cancelled' => [
            'subject' => 'Early termination cancelled — lease :reference',
            'intro' => 'The early termination request on lease :reference has been cancelled. The lease remains active.',
        ],
        'confirmed' => [
            'subject' => 'Lease terminated — :reference',
            'intro' => 'Lease :reference has been closed as of :date.',
        ],
    ],

    'lease_rent_reviewed' => [
        'subject' => 'Rent review — lease :reference',
        'greeting' => 'Hello,',
        'intro' => 'The monthly rent of lease :reference has been reviewed: :old → :new :currency.',
        'effective' => 'Effective date: :date.',
        'reason' => 'Reason: :reason',
    ],

    'invoice_reminder_sent' => [
        'subject' => 'Reminder — invoice :reference overdue',
        'greeting' => 'Hello,',
        'intro' => 'Invoice :reference is :days days overdue (due date: :due_date).',
        'amount' => 'Amount due: :amount :currency.',
        'cta' => 'Please settle the invoice as soon as possible to avoid further reminders.',
    ],

    'booking_expired' => [
        'subject' => 'Booking request #:reference expired',
        'greeting' => 'Hello,',
        'intro' => 'Your booking request #:reference for :property has expired.',
        'expired_reason' => 'The reservation request was not responded to within the agency\'s specified timeframe.',
        'next_steps' => 'You may submit a new booking request if the property is still available.',
        'unknown_property' => 'Unknown property',
    ],
];
