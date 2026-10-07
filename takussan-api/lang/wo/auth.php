<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Authentication Language Lines (WO)
|--------------------------------------------------------------------------
*/

return [
    'failed' => 'Identifiants yi mooko jëfandikoo ci nun.',
    'password' => 'Mot de passe bi neexul.',
    'throttle' => 'Lu bare jéem nga. Xaaral :seconds segond ngir jéem leneen.',
    'registration_successful' => 'Bindu bi am na. Seetal sa email.',
    'logout_successful' => 'Génn gi am na.',
    'two_factor_required' => 'Dëggal ñaareel bi war na.',
    'two_factor_invalid' => 'Kod 2FA walla kod récupération bi baaxul.',
    // TCK-589 — duggu ak telefon, tëj, session, 2FA bu war (yokk rekk).
    'phone' => [
        'sms_code' => 'Takussan : sa kod mooy :code. Dina jeex ci :minutes simili. Bul ko wax kenn.',
        'taken' => 'Nimero bii dëggal nañu ko ba noppi ci beneen kont.',
        'code_invalid' => 'Kod bi baaxul walla jeex na.',
        'already_verified' => 'Nimero bii dëggal nañu ko ba noppi.',
        'missing' => 'Amul benn nimero telefon.',
        'resend_wait' => 'Xaaral ba noppi laaj beneen kod.',
        'code_sent' => 'Su nimero bii mënee jot SMS, yónnee nanu ko benn kod.',
        'deletion_code' => 'Takussan : kodu dëggal ngir far sa kont mooy :code. Dina jeex ci :minutes simili.',
    ],
    'oauth' => [
        'challenge_invalid' => 'Défi bii jeexna walla jëfandikoo nañu ko ba noppi. Duggaatal.',
    ],
    'account' => [
        'blocked' => 'Kont bii tëj nañu ko.',
        'locked' => 'Lu bare jéem nga te baaxul. Kont bi tëju na ay simili.',
    ],
    'two_factor' => [
        'required' => 'Doxal dëggal ñaareel bi ngir wéy : lii dafa am solo.',
        'step_up_required' => 'Dëggalal ak sa kod 2FA ngir wéy.',
        'step_up_invalid' => 'Kod 2FA bi baaxul.',
        'mandatory' => 'Dëggal ñaareel bi war na ci sa kont : mën nga ko yeesal, mënuloo ko fey.',
        'not_enabled' => 'Dëggal ñaareel bi doxul.',
        'renewal_missing' => 'Tàmbalil ci sos benn sekere bu bees (yeesal sa jumtukaay).',
    ],
];
