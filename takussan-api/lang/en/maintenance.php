<?php

/*
 * TCK-592 — maintenance domain strings. Since TCK-588 a notification is a code
 * (`notifications.php` → `codes.maintenance*`) and a refusal an error code (`errors.php` →
 * `maintenance.*`); this file keeps the status labels, the validation refusals, the thread's
 * system messages and the quote PDF.
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
        'not_assignable' => 'This account cannot receive the request: it must be an active service provider with an active collaboration with the property\'s agency, or a member of its team.',
        'invitation_request_invalid' => 'The linked maintenance request must belong to this agency and be neither closed nor cancelled.',
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
