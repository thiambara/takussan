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
        'sms' => 'Takussan: your booking #:reference is pending confirmation. Stay from :start to :end.',
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

    'task_due_reminder' => [
        'subject' => 'Reminder: task due soon — :title',
        'greeting' => 'Hello,',
        'intro' => 'Your task ":title" is due tomorrow at :datetime.',
    ],

    'lease_late_fee_applied' => [
        'subject' => 'Late fee applied on payment :reference',
        'greeting' => 'Hello,',
        'intro' => 'A late fee of :amount has been applied to payment :reference.',
        'details' => 'Computed at :percent% of the remaining balance (:base).',
        // TCK-593 — ce que dit la notification est ce que dit l'écran (`late_fee_payable_online`).
        'pay_online' => 'It will be added to the amount of your online payment.',
        'pay_at_agency' => 'It is to be settled with your agency; it will not be requested with the online payment.',
    ],

    'account_deletion_requested' => [
        'subject' => 'Account deletion request received',
        'greeting' => 'Hello,',
        'intro' => 'We have registered your account deletion request. It will be executed on :date.',
        'consequences' => 'Your personal data will be irreversibly anonymized. Accounting and legal records (payments, leases, invoices) will be retained anonymously in accordance with applicable law.',
        'action' => 'Cancel deletion',
        'ignore' => 'If you did not initiate this request, cancel it immediately and change your password.',
    ],

    // TCK-272 — step-up code for accounts without a usable password
    // (OAuth, invitation, provisioning). No clickable link on purpose: this
    // confirms a destructive act, it does not invite one.
    'account_deletion_step_up' => [
        'subject' => 'Your account deletion confirmation code',
        'greeting' => 'Hello,',
        'intro' => 'Here is the code to enter to confirm the deletion of your account:',
        'expires' => 'This code is valid for :minutes minutes and can only be used once.',
        'ignore' => 'If you did not initiate this request, ignore this e-mail: without this code, nothing will be deleted.',
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
        'intro' => 'Your deposit for lease :reference has been refunded — :amount.',
        'retention' => 'A retention of :amount has been applied. Reason: :reason.',
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
        'penalty_line' => 'Early termination penalty: :amount. Due before the effective date.',
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
        'intro' => 'The monthly rent of lease :reference has been reviewed: :old → :new.',
        'effective' => 'Effective date: :date.',
        'reason' => 'Reason: :reason',
    ],

    'invoice_reminder_sent' => [
        'subject' => 'Reminder — invoice :reference overdue',
        'greeting' => 'Hello,',
        'intro' => 'Invoice :reference is :days days overdue (due date: :due_date).',
        'amount' => 'Amount due: :amount.',
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

    'threshold_alert' => [
        'title' => 'KPI alert — :metric',
    ],

    // TCK-575 — GDPR export ready e-mail (see the fr file).
    'data_export_ready' => [
        'subject' => 'Your data export is ready',
        'greeting' => 'Hello,',
        'intro' => 'Your Takussan portability archive is ready.',
        'action' => 'Open “My data”',
        'expires' => '{1} You can download it from that page for :count day.|[2,*] You can download it from that page for :count days.',
    ],

    // TCK-588 — alertes administrateur (canaux Slack, Discord, e-mail de l'exploitant).
    'admin_alert' => [
        'test_message' => '[TEST] :event triggered by a synthetic test.',
        'activity_message' => ':event — actor :actor, subject :subject',
    ],

    // TCK-588 — salutation et bouton des e-mails rendus par code (CodedNotification).
    'greeting' => 'Hello,',
    'open' => 'Open',

    // TCK-588 (ADR-0032) — une notification est un CODE rendu par surface dans la langue du destinataire : `codes.<code>.<surface>` (title, body, sms ; mail_subject/mail_body retombent sur title/body ; `_link` quand le lien de paiement est fourni). LangGroupParityTest garde les trois langues.
    'codes' => [
        'impersonation' => [
            'ended' => [
                'title' => 'Your account was viewed by the Takussan team',
                'body' => 'A member of the Takussan team, :operator, viewed your account read-only from :started_at to :ended_at. Reason: :reason. No change was made on your behalf.',
                'sms' => 'Takussan: our team viewed your account read-only (:operator). Details in your notifications.',
            ],
        ],
        'agency' => [
            'suspended' => [
                'title' => 'Agency suspended: :agency',
                'body' => 'The agency :agency has been suspended by the platform. Reason: :reason. Its listings are no longer published and its workspace is read-only.',
                'sms' => 'Takussan: the agency :agency is suspended. Its listings are removed from the site.',
            ],
            'reinstated' => [
                'title' => 'Suspension lifted: :agency',
                'body' => 'The suspension of the agency :agency has been lifted. Reason: :reason. Its public listings are visible again.',
                'sms' => 'Takussan: the suspension of :agency is lifted.',
            ],
        ],
        'platform_operator' => [
            'revoked' => [
                'title' => 'Operator removed: :operator',
                'body' => 'The platform console access of :operator has been removed. Reason: :reason.',
                'sms' => 'Takussan: console access of :operator removed.',
            ],
        ],
        'lease_payment' => [
            'due_soon' => [
                'title' => 'Rent due on :due_date',
                'body' => 'Your rent of :amount for :property is due on :due_date.',
                'body_link' => 'Your rent of :amount for :property is due on :due_date. Pay online: :payment_url',
                'sms' => 'Takussan: rent of :amount due on :due_date (:property).',
                'sms_link' => 'Takussan: rent of :amount due on :due_date. Pay: :payment_url',
            ],
            'overdue' => [
                'title' => 'Rent overdue',
                'body' => '{1} Your rent of :amount for :property, due on :due_date, is :days day overdue.|[0,*] Your rent of :amount for :property, due on :due_date, is :days days overdue.',
                'body_link' => '{1} Your rent of :amount for :property, due on :due_date, is :days day overdue. Pay online: :payment_url|[0,*] Your rent of :amount for :property, due on :due_date, is :days days overdue. Pay online: :payment_url',
                'sms' => '{1} Takussan: rent of :amount is :days day overdue (:property).|[0,*] Takussan: rent of :amount is :days days overdue (:property).',
                'sms_link' => '{1} Takussan: rent of :amount is :days day overdue. Pay: :payment_url|[0,*] Takussan: rent of :amount is :days days overdue. Pay: :payment_url',
            ],
            'overdue_landlord' => [
                'title' => 'Unpaid rent: :property',
                'body' => '{1} The rent of :amount from :tenant for :property is :days day overdue.|[0,*] The rent of :amount from :tenant for :property is :days days overdue.',
                'sms' => '{1} Takussan: rent of :amount from :tenant (:property) is :days day overdue.|[0,*] Takussan: rent of :amount from :tenant (:property) is :days days overdue.',
            ],
            'overdue_digest' => [
                'title' => '{1} :count overdue rent|[0,*] :count overdue rents',
                'body' => '{1} :count payment on your leases is overdue, totalling :total.|[0,*] :count payments on your leases are overdue, totalling :total.',
                'sms' => '{1} Takussan: :count overdue rent (:total).|[0,*] Takussan: :count overdue rents (:total).',
            ],
            'recorded' => [
                'title' => 'Payment recorded',
                'body' => 'Your payment of :amount for :property has been recorded.',
                'sms' => 'Takussan: payment of :amount recorded (:property).',
            ],
            'received_landlord' => [
                'title' => 'Rent received: :property',
                'body' => ':tenant paid :amount for :property.',
                'sms' => 'Takussan: :tenant paid :amount (:property).',
            ],
        ],
        // TCK-593 — un double encaissement à rembourser, signalé aux admins de l'agence.
        'payment' => [
            'duplicate' => [
                'title' => 'Payment collected twice',
                'body' => 'An online payment of :amount was received for :reference, which was already settled. Refund the payer or allocate the amount.',
                'sms' => 'Takussan: payment of :amount received twice for :reference. Refund or allocate it.',
            ],
            'duplicate_late_fee' => [
                'title' => 'Late fee collected twice',
                'body' => 'The late fee of :amount for :reference, already settled at the agency, was also collected online. Refund the payer or allocate the amount.',
                'sms' => 'Takussan: late fee of :amount collected twice for :reference. Refund or allocate it.',
            ],
        ],
        'booking' => [
            'created' => [
                'title' => 'New booking',
                'body' => 'Booking :reference was requested for :property, from :start_date to :end_date.',
                'sms' => 'Takussan: new booking :reference (:property).',
            ],
            'confirmed' => [
                'title' => 'Booking confirmed',
                'body' => 'Your booking :reference for :property, from :start_date to :end_date, is confirmed.',
                'sms' => 'Takussan: booking :reference confirmed (:property, :start_date).',
            ],
            'rejected' => [
                'title' => 'Booking declined',
                'body' => 'Your booking :reference for :property was declined.',
                'sms' => 'Takussan: booking :reference declined (:property).',
            ],
            'cancelled' => [
                'title' => 'Booking cancelled',
                'body' => 'Your booking :reference for :property was cancelled.',
                'sms' => 'Takussan: booking :reference cancelled (:property).',
            ],
        ],
        // TCK-589 — invitation adressée à un numéro : le nom de l'agence seul, jamais un texte de l'invitant.
        'invitation' => [
            'received' => [
                'title' => 'Invitation from :agency',
                'body' => ':agency invites you to join its team.',
                'sms' => 'Takussan: :agency invites you to join its team. Accept here: :url',
            ],
            'reminder' => [
                'title' => 'Reminder: invitation from :agency',
                'body' => 'Your invitation to join :agency is waiting.',
                'sms' => 'Takussan: reminder — your invitation to join :agency is waiting: :url',
            ],
        ],
        // TCK-589 p3-1 — avis à l'ANCIEN numéro remplacé, et au compte. Aucun numéro dans le texte.
        'account' => [
            'phone_changed' => [
                'title' => 'Phone number replaced',
                'body' => 'The verified phone number on your account was replaced. If this was not you, contact support.',
                'sms' => 'Takussan: this number is no longer the one on your account. If you did not make this change, contact support.',
            ],
            'blocked' => [
                'title' => 'Your account is blocked',
                'body' => 'Your Takussan account has been blocked by the platform. Reason: :reason. Contact support with any question.',
                'sms' => 'Takussan: your account is blocked. Contact support.',
            ],
            'reactivated' => [
                'title' => 'Your account is reactivated',
                'body' => 'Your Takussan account has been reactivated. Reason: :reason. You can sign in again.',
                'sms' => 'Takussan: your account is reactivated.',
            ],
        ],
        'visit' => [
            'reminder' => [
                'title' => 'Visit reminder: :property',
                'body' => 'Reminder: the visit of :property is scheduled for :scheduled_at.',
                'sms' => 'Takussan: visit of :property on :scheduled_at.',
            ],
            'requested' => [
                'title' => 'Visit request: :property',
                'body' => 'Requested slot: :scheduled_at. To reach the visitor: :contact.',
                'mail_body' => "A visit has been requested for :property.\nRequested slot: :scheduled_at (time zone :timezone).\nTo reach the visitor: :contact.",
                'sms' => 'Takussan: visit request for :property on :scheduled_at (:timezone).',
            ],
            'rescheduled_by_visitor' => [
                'title' => 'Another slot suggested: :property',
                'body' => 'The visitor suggests :scheduled_at. The visit awaits your confirmation.',
                'mail_body' => "The visitor has suggested another slot for :property. The visit awaits your confirmation.\nSuggested slot: :scheduled_at (time zone :timezone).",
                'sms' => 'Takussan: the visitor suggests :scheduled_at (:timezone) for :property.',
            ],
            'cancelled_by_visitor' => [
                'title' => 'Visit cancelled by the visitor: :property',
                'body' => 'The visitor has cancelled the visit planned for :scheduled_at.',
                'mail_body' => "The visitor has cancelled their visit of :property.\nIt was planned for :scheduled_at (time zone :timezone).",
                'sms' => 'Takussan: the visitor cancelled the visit of :property on :scheduled_at (:timezone).',
            ],
            'confirmed' => [
                'title' => 'Visit confirmed: :property',
                'body' => 'Your visit of :property is confirmed for :scheduled_at.',
                'mail_body' => "Your visit request for :property has been confirmed.\nScheduled for :scheduled_at (time zone :timezone).",
                'sms' => 'Takussan: your visit of “:property” is confirmed for :scheduled_at (:timezone).',
            ],
            'rescheduled' => [
                'title' => 'Your visit of :property has a new time',
                'body' => 'New time: :scheduled_at.',
                'mail_body' => "The agency has moved your visit of :property.\nNew time: :scheduled_at (time zone :timezone).",
                'sms' => 'Takussan: your visit of “:property” has been moved to :scheduled_at (:timezone).',
            ],
            'cancelled' => [
                'title' => 'Your visit of :property is cancelled',
                'body' => 'The visit planned for :scheduled_at is cancelled.',
                'mail_body' => "The agency has cancelled your visit of :property.\nIt was planned for :scheduled_at (time zone :timezone).",
                'sms' => 'Takussan: your visit of “:property” planned for :scheduled_at (:timezone) is cancelled.',
            ],
        ],
        'message' => [
            'received' => [
                'title' => 'New message from :sender',
                'body' => ':sender: :excerpt',
                'sms' => 'Takussan: new message from :sender.',
            ],
        ],
        'lead' => [
            'received' => [
                'title' => 'New request from :name — :contact',
                'body' => ':name (:contact): :message',
                'sms' => 'Takussan: new request from :name.',
            ],
            'acknowledged' => [
                'title' => 'Your request has been sent',
                'body' => 'Your request about “:about” has been sent. You will hear back shortly, by phone or by email.',
                'sms' => 'Takussan: your request about :about has been sent.',
            ],
        ],
        'kyc' => [
            'submitted' => [
                'title' => 'Agency KYC to review',
                'body' => 'The KYC file of :agency has been submitted.',
                'sms' => 'Takussan: KYC of :agency to review.',
            ],
            'verified' => [
                'title' => 'Agency KYC verified',
                'body' => 'Your KYC file has been verified.',
                'sms' => 'Takussan: your KYC file is verified.',
            ],
            'rejected' => [
                'title' => 'Agency KYC rejected',
                'body' => 'Your KYC file was rejected: :reason',
                'sms' => 'Takussan: your KYC file was rejected.',
            ],
        ],
        'role_delegation' => [
            'activated' => [
                'title' => 'Role delegated — :role',
                'body' => 'You have been granted the :role role until :ends_at.',
                'sms' => 'Takussan: :role role granted until :ends_at.',
            ],
            'activated_delegator' => [
                'title' => 'Role delegated — :role',
                'body' => 'The delegation to :beneficiary for the :role role is now active.',
                'sms' => 'Takussan: :role delegation to :beneficiary is active.',
            ],
            'expired' => [
                'title' => 'Delegation expired — :role',
                'body' => 'Your delegation for the :role role has ended.',
                'sms' => 'Takussan: :role delegation ended.',
            ],
            'expired_delegator' => [
                'title' => 'Delegation expired — :role',
                'body' => 'The delegation to :beneficiary for the :role role has expired.',
                'sms' => 'Takussan: :role delegation to :beneficiary expired.',
            ],
            'revoked' => [
                'title' => 'Delegation revoked — :role',
                'body' => 'Your delegation for the :role role has been revoked.',
                'sms' => 'Takussan: :role delegation revoked.',
            ],
            'revoked_delegator' => [
                'title' => 'Delegation revoked — :role',
                'body' => 'You have revoked the delegation from :beneficiary for the :role role.',
                'sms' => 'Takussan: :role delegation of :beneficiary revoked.',
            ],
        ],
        'bank_statement' => [
            'imported' => [
                'title' => 'Statement imported',
                'body' => '{1} Your statement :bank (:lines line) is ready for reconciliation.|[0,*] Your statement :bank (:lines lines) is ready for reconciliation.',
                'sms' => 'Takussan: statement :bank imported.',
            ],
            'finalized' => [
                'title' => 'Statement finalized',
                'body' => 'The statement from :period_start to :period_end has been finalized (:confirmed/:total lines reconciled).',
                'sms' => 'Takussan: statement from :period_start to :period_end finalized.',
            ],
        ],
        'maintenance' => [
            'created' => [
                'title' => 'New maintenance request',
                'body' => 'A maintenance request (:reference) was submitted for :property.',
                'sms' => 'Takussan: maintenance request :reference (:property).',
            ],
        ],
        'maintenance_quote' => [
            'requested' => [
                'title' => 'Quote requested: :request',
                'body' => 'A quote is requested from you for the job ":request".',
                'sms' => 'Takussan: quote requested for ":request".',
            ],
            'submitted' => [
                'title' => 'Quote submitted: :request',
                'body' => 'A quote of :amount was submitted for the job ":request".',
                'sms' => 'Takussan: quote of :amount submitted for ":request".',
            ],
            'approved' => [
                'title' => 'Quote approved: :request',
                'body' => 'Your quote for the job ":request" was approved.',
                'sms' => 'Takussan: quote approved for ":request".',
            ],
            'rejected' => [
                'title' => 'Quote rejected: :request',
                'body' => 'Your quote for the job ":request" was rejected.',
                'sms' => 'Takussan: quote rejected for ":request".',
            ],
        ],
        'prospect_match' => [
            'digest' => [
                'title' => 'Properties match your prospects',
                'body' => ':properties new or repriced property(ies) match :prospects of your prospects.',
                'sms' => 'Takussan: :properties property(ies) match :prospects of your prospects.',
            ],
        ],
        'property' => [
            'approved' => [
                'title' => 'Property approved: :property',
                'body' => 'Your property ":property" was approved and is now visible on the platform.',
                'sms' => 'Takussan: listing ":property" approved.',
            ],
            'rejected' => [
                'title' => 'Property rejected: :property',
                'body' => 'Your property ":property" was rejected. Reason: :reason. You can fix the listing and resubmit it from your workspace.',
                'sms' => 'Takussan: listing ":property" rejected.',
            ],
            'unpublished_contact_erased' => [
                'title' => 'Listing removed: :property',
                'body' => 'The listing :property (:reference) has been removed from the site: its only contact erased their account. Assign an agent, then publish it again: :url',
                'sms' => 'Takussan: listing :reference removed, no contact left.',
            ],
        ],
    ],

    // TCK-588 — textes des classes Notification qui écrivaient leur prose en dur (français seulement).
    'threshold_alert_mail' => [
        'subject' => '[Takussan] KPI alert — :metric',
        'intro' => 'A monitored metric has crossed its threshold.',
        'above' => ':metric: :value is above :threshold (severity: :severity).',
        'below' => ':metric: :value is below :threshold (severity: :severity).',
        'action' => 'Open the dashboard',
        'cooldown' => '{1} This alert will not be sent again for :hours hour.|[0,*] This alert will not be sent again for :hours hours.',
    ],
    'urgent_maintenance' => [
        'subject' => 'URGENT: :title',
        'subject_escalation' => 'URGENT ESCALATION: :title',
        'greeting' => 'Hello,',
        'intro' => 'An URGENT maintenance request was submitted for the property.',
        'job' => 'Job: :title',
        'intro_escalation' => 'Maintenance request #:id (:title) is URGENT and has not been handled for more than 30 minutes.',
        'cta' => 'Please take charge of this request immediately.',
        'title' => 'Urgent: :title',
        'title_escalation' => 'Urgent escalation: :title',
    ],
    'activity_log_export' => [
        'subject' => 'Your audit log export is ready',
        'greeting' => 'Hello,',
        'intro' => '{1} Your audit log export (:count entry) is ready.|[0,*] Your audit log export (:count entries) is ready.',
        'expires' => 'The download link expires in 24 hours.',
        'action' => 'Download the export',
        'file' => 'File: :filename',
    ],
    'report_export' => [
        'subject' => 'Your report export is ready',
        'intro' => 'The export of the report ":report" is ready for download.',
        'action' => 'Download',
        'expires' => 'This link expires in 7 days.',
    ],

    // TCK-587 — un bailleur rattaché propose un bien à son agence (brouillon privé à relire).
    'property_proposed' => [
        'title' => 'Property proposed by a landlord: :title',
    ],
];
