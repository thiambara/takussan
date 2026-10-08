<?php

// TCK-599 (ADR-0050 §3) — saved-search alerts, in the recipient's language.
return [
    'default_name' => 'My search',
    'title' => 'New listings for “:name”',
    'body' => '{1} One new listing matches your search “:name”.|[2,*] :total new listings match your search “:name”.',
    'mail' => [
        'greeting' => 'Hello,',
        'see_all' => '{1} See the result|[2,*] See all :total results',
        'more' => '{1} And one more listing on Takussan.|[2,*] And :count more listings on Takussan.',
        'view_property' => 'View listing',
        'unsubscribe' => 'Stop this alert',
        'reason' => 'You are receiving this email because you created the alert “:name” on Takussan.',
    ],
    'whatsapp' => '{1} One new listing for “:name”: :url|[2,*] :total new listings for “:name”: :url',
    'confirm' => [
        'mail' => [
            'subject' => 'Confirm your Takussan alert',
            'greeting' => 'Hello,',
            'intro' => 'You asked to be told about new listings matching your search. Nothing will be sent until you confirm.',
            'action' => 'Confirm my alert',
            'expire' => 'This link expires in :hours hours.',
            'ignore' => 'If you did not make this request, ignore this email: it will be erased.',
        ],
    ],
];
