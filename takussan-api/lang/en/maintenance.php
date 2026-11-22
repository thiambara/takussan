<?php

/*
 * TCK-592 — maintenance domain strings. Since TCK-588 a notification is a code
 * (`notifications.php` → `codes.maintenance*`) and a refusal an error code (`errors.php` →
 * `maintenance.*`); this file keeps the validation refusals and the quote PDF. TCK-2958: the status
 * labels and the thread's system messages left with their last reader
 * (`SystemMessageFactory::humanise`) — the front composes the notice from its code.
 */
return [

    'errors' => [
        'not_assignable' => 'This account cannot receive the request: it must be an active service provider with an active collaboration with the property\'s agency, or a member of its team.',
        // TCK-2715 — la borne haute du passage (`MaintenanceRequest::SCHEDULING_HORIZON_MONTHS`).
        'beyond_scheduling_horizon' => 'The visit cannot be scheduled more than a year ahead.',
        'invitation_request_invalid' => 'The linked maintenance request must belong to this agency and be neither closed nor cancelled.',
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

    // TCK-2911 (ADR-0120 § 2) — the service provider's bill statement.
    'bill_statement_pdf' => [
        'title' => 'My bills statement',
        'provider' => 'Service provider',
        'period' => 'Period',
        'reference' => 'Reference',
        'date' => 'Date',
        'request' => 'Job',
        'property' => 'Property',
        'status' => 'Status',
        'amount' => 'Amount',
        'empty' => 'No bill over this period.',
        'billed_total' => 'Total billed (excluding rejected and cancelled)',
        'paid_total' => 'Of which paid',
        'statuses' => [
            'draft' => 'To invoice',
            'pending_validation' => 'Awaiting validation',
            'validated' => 'Validated',
            'rejected' => 'Rejected',
            'paid' => 'Paid',
            'cancelled' => 'Cancelled',
        ],
    ],

    // TCK-2897 (ADR-0099, amendment of 2026-11-15) — the PDF of a service provider bill.
    'bill_pdf' => [
        'title' => 'Job invoice',
        'reference' => 'Reference',
        'provider_reference' => 'Provider reference',
        'date' => 'Date',
        'request' => 'Job',
        'property' => 'Property',
        'provider' => 'Service provider',
        'status' => 'Status',
        'amount' => 'Amount',
    ],

    // TCK-2897 (ADR-0099, amendment of 2026-11-15) — the job completion report.
    'completion_report_pdf' => [
        'title' => 'Job completion report',
        'request' => 'Job',
        'property' => 'Property',
        'provider' => 'Service provider',
        'reported_at' => 'Reported on',
        'started_at' => 'Started on',
        'completed_at' => 'Completed on',
        'cost' => 'Actual cost',
        'description' => 'Requested work',
        'resolution' => 'Work done',
        'no_notes' => 'No notes.',
        'photos_before' => 'Photos before',
        'photos_after' => 'Photos after',
        'no_photos' => 'No photo.',
    ],
];
