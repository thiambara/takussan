<?php

return [

    'salutation' => 'The Takussan team',

    // TCK-249 — Invitation lifecycle emails.
    'invitation' => [
        'subject' => 'You have a Takussan invitation',
        'reminder_subject' => 'Reminder — your Takussan invitation',
        'greeting' => 'Hello,',
        'intro' => 'You have been invited to join Takussan as a :role.',
        'reminder_intro' => 'Friendly reminder: your Takussan invitation as :role is still pending.',
        'action' => 'Accept the invitation',
        'expires_at' => 'This link expires on :date.',
        'ignore' => 'If this invitation does not concern you, you may ignore this email.',
    ],

    'invitation_accepted' => [
        'subject' => ':email accepted your invitation',
        'greeting' => 'Hello,',
        'intro' => ':email has just accepted your invitation and joined the platform as :role.',
    ],

    'invitation_expired' => [
        'subject' => 'Your invitation to :email has expired',
        'greeting' => 'Hello,',
        'intro' => 'The invitation you sent to :email expired before it was accepted.',
        'advice' => 'You can resend it from your dashboard to nudge the recipient.',
    ],

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
        'see_all' => 'See all notifications',
        'unsubscribe' => 'Unsubscribe from digest emails',
    ],

    'types' => [
        'booking' => 'Bookings',
        'payment' => 'Payments',
        'lease' => 'Leases',
        'maintenance' => 'Maintenance',
        'visit' => 'Visits',
        'message' => 'Messages',
        'system' => 'System',
        'bank_statement_imported' => 'Bank statement imported',
        'bank_statement_finalized' => 'Bank statement finalized',
        'role_delegated' => 'Role delegation',
        'role_delegation_expired' => 'Delegation expired',
        'role_delegation_revoked' => 'Delegation revoked',
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

    // TCK-265 — one-shot welcome notification fired on Lease.activated.
    'tenant_welcome' => [
        'subject' => 'Welcome home — lease :reference',
        'greeting' => 'Hello,',
        'intro' => 'Your lease :reference is now active.',
        'body' => 'Track your upcoming payments, request maintenance and access your documents from your tenant space.',
        'action' => 'Open my tenant space',
    ],

    // TCK-266 — J+7 reminder when the move-in inventory is still unsigned.
    'tenant_inventory_reminder' => [
        'subject' => 'Reminder — move-in inventory still unsigned (lease :reference)',
        'greeting' => 'Hello,',
        'intro' => 'Your move-in inventory for lease :reference has not been signed yet.',
        'body' => 'Without a signed inventory, your file remains incomplete. Sign in to your tenant space to finalize the signature.',
        'action' => 'Sign the inventory',
    ],

    'agent_tenant_inventory_reminder' => [
        'subject' => 'Tenant late on move-in inventory — lease :reference',
        'greeting' => 'Hello,',
        'intro' => ':tenant has not signed the move-in inventory for lease :reference yet (more than 7 days).',
        'body' => 'Check with your tenant whether a follow-up or assistance is needed to complete the signature.',
        'action' => 'View pending onboardings',
        'unknown_tenant' => 'The tenant',
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
