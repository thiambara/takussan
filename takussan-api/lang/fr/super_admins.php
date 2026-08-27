<?php

return [
    'cooptation' => [
        'errors' => [
            'not_super_admin' => 'Seul un super-admin peut coopter un autre super-admin.',
            'already_super_admin' => "L'utilisateur :email est déjà super-admin.",
            'enroll_first' => 'Vous devez appeler /super-admin/2fa/enroll avant de confirmer un code.',
            'invalid_code' => 'Code TOTP invalide.',
            'not_pending' => 'Aucun onboarding super-admin en attente pour ce compte.',
            'invitation_not_found' => 'Cette invitation de cooptation est introuvable.',
        ],
        'notifications' => [
            'invited' => [
                'subject' => 'Un nouveau super-admin a été invité (:email)',
                'body' => ':inviter vient d\'inviter :email à devenir super-admin.',
            ],
            'accepted' => [
                'subject' => ':name est désormais super-admin',
                'body' => ':name (:email) a terminé son enrôlement 2FA et est désormais super-admin.',
            ],
        ],
    ],
];
