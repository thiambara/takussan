<?php

return [
    // General
    'booking' => 'Booking',
    'visit' => 'Visit',
    'review_reported' => 'The review has been reported successfully.',

    // Property
    'property_cannot_publish' => 'Sold or rented properties cannot be published.',
    'property_cannot_unpublish' => 'Only available properties can be unpublished.',
    'property_parent_cycle_detected' => 'A property cannot be placed under itself or one of its descendants.',
    'property_parent_max_depth_exceeded' => 'The maximum hierarchy depth is 4 levels.',
    'property_parent_same_agency_required' => 'The parent property must belong to the same agency as the child.',

    // User / Agency
    'user_already_in_agency' => 'This user already belongs to another agency.',
    'user_not_in_agency' => 'This user is not a member of this agency.',
    'cannot_remove_primary_admin' => 'Cannot remove the primary admin of the agency.',
    'cannot_remove_last_agency_admin' => 'Cannot remove the last agency admin of the agency.',
    'user_not_found_by_email' => 'No active user was found for this email address.',
    'cannot_block_self' => 'You cannot block your own account.',
    'cannot_delete_self' => 'You cannot delete your own account via this route.',
    'collaborator_already_exists' => 'This collaborator is already added to this property.',
    'only_super_admin_can_grant_super_admin' => 'Only a super admin can grant the super_admin role.',
    'target_user_has_no_active_agency' => 'The target user has no resolvable agency context. Activate a profile for them or specify the target agency before assigning an agency-scoped role.',

    // Integrations
    'integration_inactive' => 'The integration is disabled. Enable it before testing.',
    'integration_missing_credentials' => 'No credentials configured for this integration.',
    'integration_test_ok' => ':provider connection verified successfully.',

    // Tags
    'tag_in_use' => 'This tag is still attached to one or more properties or customers.',

    // Lease
    'lease_cannot_terminate' => 'Only active or pending-signature leases can be terminated.',
    'lease_renewal_status_not_renewable' => 'Only active or expired leases can be renewed.',
    'lease_renewal_active_child_exists' => 'This lease already has an active amendment. Terminate or wait for it to expire before creating a new one.',
    'lease_renewal_max_chain_exceeded' => 'The renewal chain cannot exceed :max levels.',
    'lease_renewal_field_immutable' => 'The :field field cannot be changed in an amendment — create a new lease instead.',
    'lease_renewal_end_after_start' => 'The end date must be after the start date.',
    'lease_must_be_ended_for_refund' => 'The lease must be terminated or expired to refund the deposit.',
    'deposit_already_refunded' => 'The deposit has already been fully refunded for this lease.',
    'no_deposit_to_refund' => 'No deposit amount to refund.',
    'refund_amount_required' => 'A non-zero refund amount is required.',
    'refund_amount_exceeds_remaining' => 'Amount exceeds the remaining deposit balance.',
    'refund_reason_required_for_partial' => 'A reason is required for a partial refund.',
    'deposit_refund_payout_note' => 'Deposit refund — lease :reference',
    'deposit_retention_invoice_line' => 'Deposit retention — :reason',

    // Lease — early termination (TCK-090)
    'lease_early_termination_status_not_requestable' => 'Only active or expired leases can be terminated early.',
    'lease_early_termination_already_in_progress' => 'An early termination is already in progress for this lease.',
    'lease_early_termination_notice_too_short' => 'Notice period not respected. The effective date must be on or after :min.',
    'lease_early_termination_after_end_date' => 'The effective date must be strictly before the contractual end. Use the regular end-of-lease flow.',
    'lease_early_termination_not_in_progress' => 'No early termination is currently in progress for this lease.',
    'lease_early_termination_window_closed' => 'Cancellation window has closed — the effective date has passed.',
    'lease_early_termination_penalty_paid' => 'The penalty has already been paid — early termination can no longer be cancelled.',
    'lease_early_termination_penalty_unpaid' => 'The penalty must be settled before the lease can be marked as terminated.',
    'lease_early_termination_too_early' => 'The effective date has not yet been reached.',
    'lease_early_termination_invoice_line' => 'Early termination penalty — lease :reference (effective :effective)',

    // Lease — rent review (TCK-091)
    'lease_rent_review_status_not_reviewable' => 'Only active leases can have their rent reviewed.',
    'lease_rent_review_reason_required' => 'A reason is required (between 5 and 500 characters).',
    'lease_rent_review_invalid_amount' => 'The new rent must be strictly greater than zero.',
    'lease_rent_review_no_baseline' => 'The lease has no monthly rent — review impossible.',
    'lease_rent_review_variation_excessive' => 'Variation above the allowed threshold (:max %). Variation: :variation %. Resend with force=true if you hold the required permission.',
    'lease_rent_review_force_not_allowed' => 'You do not have permission to force an excessive variation (leases.rent_review_force).',
    'lease_rent_review_no_back_dating' => 'The effective date cannot be earlier than today.',
    'lease_rent_review_effective_date_invalid' => 'The effective date is invalid.',
    'lease_rent_use_dedicated_endpoint' => 'The rent must be updated through PATCH /api/leases/{id}/rent to guarantee traceability.',

    // Notifications
    'new_maintenance_title' => 'New maintenance request',
    'new_maintenance_body' => 'A maintenance request has been submitted for :property.',
    'payment_reminder_title' => 'Payment reminder',
    'payment_reminder_body' => 'Your rent for :property is due on :date.',
    'late_payment_title' => 'Late payment',
    'late_payment_body' => 'Your payment for :property is overdue since :date.',
    'visit_reminder_title' => 'Visit reminder',
    'visit_reminder_body' => 'You have a visit scheduled tomorrow for :property.',
    'overdue_invoice_title' => 'Overdue invoice',
    'overdue_invoice_body' => 'Invoice #:reference is overdue.',
    'booking_confirmed_title' => 'Booking confirmed',
    'booking_confirmed_body' => 'Your booking for :property has been confirmed.',
    'lease_activated_title' => 'Lease activated',
    'lease_activated_body' => 'Your lease for :property is now active.',
    'new_message_title' => 'New message',
    'new_message_body' => ':sender sent you a message.',
];
