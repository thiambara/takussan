<?php

/**
 * TCK-249 — Invitation strings (Wolof).
 *
 * Initial pass focused on the user-facing error messages and email
 * vocabulary. Full editorial review is tracked separately under the
 * i18n cleanup tickets.
 */
return [
    'roles' => [
        'owner' => 'borom',
        'agent' => 'agent',
        'agency_admin' => 'jiitalkat agence',
        'service_provider' => 'jaaykat liggéey',
        'super_admin' => 'super-administrateur',
    ],
    'errors' => [
        'duplicate_pending' => 'Am na ndaw lu xaaru ngir email bi (#:id).',
        'requires_login' => 'Email bii dafa am ab compte. Dugg al ngir nangu invitation bi.',
        'email_mismatch' => 'Email bu nga dugg ci compte bi du jaadu ak email bu invitation bi.',
        'token_not_found' => 'Lëkkalekaay bi gisuñu ko.',
        'token_expired' => 'Lëkkalekaay bi jeex na.',
        'token_accepted' => 'Lëkkalekaay bi nanguwoon nañu ko.',
        'token_revoked' => 'Lëkkalekaay bi indi nañu ko ci suuf.',
        'token_sent' => 'Lëkkalekaay bi ngir xaar la.',
        'cannot_create' => 'Amul nga ndimbal ngir yónni invitation.',
        'cannot_view' => 'Amul nga ndimbal ngir gis invitation bi.',
        'cannot_revoke' => 'Amul nga ndimbal ngir indi invitation bi ci suuf.',
        'cannot_resend' => 'Invitation bi mënuñu koo bañ a yónni.',
        'already_accepted' => 'Invitation bi nanguwoon nañu ko, mënuñu koo indi ci suuf.',
        'invalid_role' => 'Wàll bi laaj nga, du baax ngir invitation.',
        'cross_agency' => 'Mënul nga woo nit ci agence wenn.',
    ],
];
