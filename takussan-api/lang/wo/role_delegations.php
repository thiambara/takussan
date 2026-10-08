<?php

// TCK-588 — ce groupe n'existait pas en wolof : tout retombait sur l'anglais (fallback_locale = en).
return [
    'notifications' => [
        'activated' => [
            'title' => 'Ndawal dencukaay — :role',
            'body_beneficiary' => 'Jot nga ndawal :role ba :ends_at.',
            'body_delegator' => 'Ndawal :role bi nga jox :beneficiary tàmbali na.',
        ],
        'expired' => [
            'title' => 'Ndawal bi jeex na — :role',
            'body_beneficiary' => 'Sa ndawal ngir :role jeex na.',
            'body_delegator' => 'Ndawal :role bi nga jox :beneficiary jeex na.',
        ],
        'revoked' => [
            'title' => 'Ndawal bi dindi nañu ko — :role',
            'body_beneficiary' => 'Sa ndawal ngir :role dindi nañu ko.',
            'body_delegator' => 'Dindi nga ndawal :role bi nga joxoon :beneficiary.',
        ],
    ],
    'validation' => [
        'self_delegation' => 'Mënuloo jox sa bopp ndawal.',
        'non_delegable_role' => 'Ndawal bii mënul a jox keneen.',
        'max_duration' => 'Diir bi gën a yàgg mooy :max fan.',
        'user_not_in_agency' => 'Jëfandikukat bi bokkul ci agence bii.',
        'already_primary_admin' => 'Jëfandikukat bii mooy admin bu njëkk bu agence bi ba noppi.',
    ],
];
