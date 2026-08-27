<?php

return [
    'cooptation' => [
        'errors' => [
            'not_super_admin' => 'Ku amul super-admin rekk moo gën a man jëfandiku ñu wuutu super-admin.',
            'already_super_admin' => ':email mooy super-admin ba noppi.',
            'enroll_first' => 'Defal /super-admin/2fa/enroll bu jëkk ngir confirmer sa kod.',
            'invalid_code' => 'Kodu TOTP du baax.',
            'not_pending' => 'Amul benn onboarding super-admin ci sa kont.',
            'invitation_not_found' => 'Kañu bu cooptation bii amul.',
        ],
        'notifications' => [
            'invited' => [
                'subject' => 'Ñu jox naa kañu bu bees ngir mu nekk super-admin (:email)',
                'body' => ':inviter mooy jox kañu :email ngir mu nekk super-admin.',
            ],
            'accepted' => [
                'subject' => ':name nekk na super-admin',
                'body' => ':name (:email) noppi na 2FA, mu nekk leegi super-admin.',
            ],
        ],
    ],
];
