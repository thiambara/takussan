<?php

// TCK-599 §5 — alertes yi ci say kër yu la neex, ci làkku ki koy jot.
return [
    'price_drop' => [
        'title' => 'Njëg wàcc na ci say kër yu la neex',
        'body' => '{1} Njëgu benn kër ci say kër yu la neex wàcc na.|[2,*] Njëgu :count kër ci say kër yu la neex wàcc na.',
        'line' => '« :title » : :old → :new',
    ],
    'unavailable' => [
        'title' => 'Benn kër gu la neex amatul',
        'body' => '{1} Benn kër ci say kër yu la neex amatul.|[2,*] :count kër ci say kër yu la neex amatuñu.',
        'line_rented' => '« :title » luwe nañu ko.',
        'line_sold' => '« :title » jaay nañu ko.',
        'line_unavailable' => '« :title » nekkatul ci lu ñuy jaay.',
        'line_removed' => 'Benn kër ci say kër yu la neex dindi nañu ko.',
    ],
    'mail' => [
        'greeting' => 'Asalaa Maalekum,',
        'action' => 'Xool samay kër yu ma neex',
    ],
];
