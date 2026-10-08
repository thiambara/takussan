<?php

// TCK-599 (ADR-0050 §3) — alertes yi ci sa wut, ci làkku ki koy jot.
return [
    'default_name' => 'Sama wut',
    'title' => 'Kër yu bees ngir « :name »',
    'body' => '{1} Benn kër gu bees mengoo na ak sa wut « :name ».|[2,*] :total kër yu bees mengoo nañu ak sa wut « :name ».',
    'mail' => [
        'greeting' => 'Asalaa Maalekum,',
        'see_all' => '{1} Xool li ñu gis|[2,*] Xool :total yi ñu gis',
        'more' => '{1} Ak beneen kër ci Takussan.|[2,*] Ak :count yeneen kër ci Takussan.',
        'view_property' => 'Xool kër gi',
        'unsubscribe' => 'Bul ma yónneeti alerte bii',
        'reason' => 'Jot nga e-mail bii ndax sos nga alerte « :name » ci Takussan.',
    ],
    'whatsapp' => '{1} Benn kër gu bees ngir « :name » : :url|[2,*] :total kër yu bees ngir « :name » : :url',
    'confirm' => [
        'mail' => [
            'subject' => 'Dëggël sa alerte Takussan',
            'greeting' => 'Asalaa Maalekum,',
            'intro' => 'Laaj nga ñu xamal la kër yu bees yu mengoo ak « :name ». Dunañu la yónne dara balaa nga koy dëggël.',
            'action' => 'Dëggël sama alerte',
            'expire' => 'Lënk bii dafay jeex ci :hours waxtu.',
            'ignore' => 'Soo laajul lii, bul ko xool : dinañu ko far.',
        ],
    ],
];
