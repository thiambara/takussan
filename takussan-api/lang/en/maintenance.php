<?php

/*
 * TCK-592 — maintenance domain strings. The API writes no literal: every notification and every
 * refusal goes through a key of this file, rendered in the RECIPIENT's language.
 */
return [
    'status' => [
        'open' => 'open',
        'acknowledged' => 'acknowledged',
        'quote_requested' => 'quote requested',
        'quote_submitted' => 'quote submitted',
        'awaiting_owner' => 'awaiting the landlord',
        'approved' => 'quote approved',
        'rejected' => 'quote rejected',
        'assigned' => 'assigned',
        'in_progress' => 'in progress',
        'completed' => 'completed',
        'closed' => 'closed',
        'cancelled' => 'cancelled',
    ],

    'errors' => [
        'transition_not_allowed' => 'Moving from ":from" to ":to" is not allowed.',
        'dedicated_endpoint' => 'This status change goes through its own action, not through the generic status.',
        'not_assignable' => 'This account cannot receive the request: it must be an active service provider with an active collaboration with the property\'s agency, or a member of its team.',
        'decline_after_accept' => 'The request has already been accepted or started: it can no longer be declined.',
        'already_accepted' => 'The request is already accepted.',
        'terminal_request' => 'A closed or cancelled request no longer accepts files.',
        'cost_ambiguous' => 'Provide either "cost" or "actual_cost", not both.',
        'before_photos_requires_acceptance' => '"Before" photos are reserved to the service provider who accepted the request.',
        'quote_expired' => 'This quote is no longer valid: its validity date has passed.',
        'invitation_request_invalid' => 'The linked maintenance request must belong to this agency and be neither closed nor cancelled.',
        'collaboration_transition' => 'This collaboration status change is not allowed.',
    ],

    'notifications' => [
        'created' => [
            'title' => 'New maintenance request',
            'body' => 'A maintenance request was submitted for :property: ":title".',
        ],
        'assigned' => [
            'title' => 'New job: :title',
            'body' => 'A job is assigned to you at :property. Accept or decline it from its page.',
        ],
        'unassigned' => [
            'title' => 'Job withdrawn: :title',
            'body' => 'The job ":title" is no longer assigned to you.',
        ],
        'accepted' => [
            'title' => 'Job accepted: :title',
            'body' => ':provider accepted the job ":title".',
        ],
        'declined' => [
            'title' => 'Job declined: :title',
            'body' => ':provider declined the job ":title". Reason: :reason',
        ],
        'quote_requested' => [
            'title' => 'Quote requested: :title',
            'body' => 'A quote is requested from you for the job ":title".',
        ],
        'quote_submitted' => [
            'title' => 'Quote submitted: :title',
            'body' => 'A quote of :amount was submitted for the job ":title".',
        ],
        'quote_awaiting_owner' => [
            'title' => 'Your approval is required: :title',
            'body' => 'A quote of :amount for ":title" exceeds the works ceiling agreed with your agency. Approve or reject it.',
        ],
        'quote_approved' => [
            'title' => 'Quote approved: :title',
            'body' => 'Your quote for the job ":title" was approved.',
        ],
        'quote_rejected' => [
            'title' => 'Quote rejected: :title',
            'body' => 'Your quote for the job ":title" was rejected. Reason: :reason',
        ],
        'completed' => [
            'title' => 'Job completed: :title',
            'body' => 'The service provider completed the job ":title". The requester must confirm the repair.',
        ],
        'confirmed' => [
            'title' => 'Repair confirmed: :title',
            'body' => 'The requester confirmed the repair: the job ":title" is closed.',
        ],
        'contested' => [
            'title' => 'Repair contested: :title',
            'body' => 'The problem persists on ":title". Comment: :comment',
        ],
        'auto_closed' => [
            'title' => 'Job closed: :title',
            'body' => 'With no answer within :days days, the job ":title" was closed automatically.',
        ],
        'cancelled' => [
            'title' => 'Job cancelled: :title',
            'body' => 'The job ":title" was cancelled.',
        ],
        'step' => [
            'title' => 'Your request ":title": :status',
            'body' => 'Your maintenance request is now: :status.',
            'body_scheduled' => 'Your maintenance request is now: :status. Visit planned on :date.',
        ],
    ],

    'system' => [
        'assigned' => 'Job assigned to :provider.',
        'unassigned' => 'The job is no longer assigned to :provider.',
        'accepted' => ':provider accepted the job.',
        'declined' => ':provider declined the job.',
        'status' => 'Status: :status.',
    ],

    'quote_pdf' => [
        'title' => 'Maintenance quote',
        'request' => 'Job',
        'property' => 'Property',
        'provider' => 'Service provider',
        'submitted_at' => 'Submitted on',
        'valid_until' => 'Valid until',
        'duration' => 'Estimated duration',
        'duration_days' => ':days day(s)',
        'label' => 'Item',
        'kind' => 'Type',
        'quantity' => 'Quantity',
        'unit_price' => 'Unit price',
        'line_total' => 'Total',
        'total' => 'Quote total',
        'kinds' => [
            'labour' => 'Labour',
            'supply' => 'Supply',
        ],
    ],
];
