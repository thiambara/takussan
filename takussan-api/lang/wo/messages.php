<?php

/*
|--------------------------------------------------------------------------
| Generic Message Lines (WO — Wolof)
|--------------------------------------------------------------------------
| Partial translation — fallback to FR for unspecified keys.
*/

return [
    // General
    'booking' => 'Wootu',
    'visit' => 'Seeti',
    'review_reported' => 'Ñi laaj la, jàppal nañu ko.',

    // Property
    'property_cannot_publish' => 'Mbaar yi ñu jaay walla ñu luwé du ñu mën a siiwal.',
    'property_cannot_unpublish' => 'Mbaar yi ñu mën a jël rekk la ñu mën a xëccu.',
    'property_parent_cycle_detected' => 'Mbaar du mën a nekk ci suufam walla ci suuf seen sàccu.',
    'property_parent_max_depth_exceeded' => 'Profondeer bu max ci hiérarchie bi mooy 4 niveau.',
    'property_parent_same_agency_required' => 'Mbaar bu nekk parent dañ ko nekkati ci agence bu mel ni doom bi.',

    // User / Agency
    'user_already_in_agency' => 'Jàngalekat bi nekk na ci beneen agence.',
    'user_not_in_agency' => 'Jàngalekat bi nekkul ci agence bi.',
    'cannot_remove_primary_admin' => 'Mën nañu digal admin bu njëkk bi.',
    'cannot_remove_last_agency_admin' => 'Du ñu mën digal mujj admin bi ci agence bi.',
    'user_not_found_by_email' => 'Ngemb bu email bi, jàngalekat amul.',
    'cannot_block_self' => 'Mën nga téqale sa bopp.',
    'cannot_delete_self' => 'Mën nga far sa bopp ci yoon wii.',
    'collaborator_already_exists' => 'Jàngalekat bi ci mbaar mi nekk na.',
    'only_super_admin_can_grant_super_admin' => 'Super admin rekk mën na jox super_admin.',

    // Lease
    'lease_cannot_terminate' => 'Luwé yi jàpp walla yi ñu baaxal rekk la ñu mën tas.',
    'lease_renewal_status_not_renewable' => 'Luwé yi jàpp walla yi jeex rekk la ñu mën a yeesalaat.',
    'lease_renewal_active_child_exists' => 'Luwé bii am na ba noppi avenant bu jàpp. Tasal ko walla xaarël ba mu jeex.',
    'lease_renewal_max_chain_exceeded' => 'Yeesalaat bi du wàcc :max niveau.',
    'lease_renewal_field_immutable' => 'Champ bi :field mën nañu ko soppi ci avenant — sose luwé bu bees.',
    'lease_renewal_end_after_start' => 'Bisu mujj bi war a am ci ginnaaw bisu tàmbali bi.',
    'lease_must_be_ended_for_refund' => 'Luwé bi war a jeex walla mujj bala ñu delloo kaution.',
    'deposit_already_refunded' => 'Kaution bi delloo nañu ko ba noppi.',
    'no_deposit_to_refund' => 'Amul kaution bu ñuy delloo.',
    'refund_amount_required' => 'Mbënd mi war a am, bu nu war a delloo.',
    'refund_amount_exceeds_remaining' => 'Mbënd mi gënal kaution bi des.',
    'refund_reason_required_for_partial' => 'Su delloo gi gen, motivation lañu war a indi.',
    'deposit_refund_payout_note' => 'Delloo kaution — luwé :reference',
    'deposit_retention_invoice_line' => 'Téye kaution — :reason',

    // Lease — rent review (TCK-091)
    'lease_rent_review_status_not_reviewable' => 'Luwé yi jàpp rekk la ñu mën a yeesalaat layeer bi.',
    'lease_rent_review_reason_required' => 'Mboor mu jaadu, 5 ba 500 caractères.',
    'lease_rent_review_invalid_amount' => 'Layeer bu bees bi war a doon yu gen 0.',
    'lease_rent_review_no_baseline' => 'Luwé bii amul layeer mensuel — du nu mën a yeesalaat.',
    'lease_rent_review_variation_excessive' => 'Variation gënal seuil bi ( :max % ). Variation : :variation %. Yónnee force=true su nga am permission.',
    'lease_rent_review_force_not_allowed' => 'Amuloo ndimbal ngir forcer variation bu kawe (leases.rent_review_force).',
    'lease_rent_review_no_back_dating' => 'Bisu njëlbeen bi du wàcc ci ginnaaw tey.',
    'lease_rent_review_effective_date_invalid' => 'Bisu njëlbeen bi baaxul.',
    'lease_rent_use_dedicated_endpoint' => 'Layeer war na soppi ci PATCH /api/leases/{id}/rent ngir traçabilité.',
];
