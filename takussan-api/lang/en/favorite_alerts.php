<?php

// TCK-599 §5 — favourite alerts, in the recipient's language.
return [
    'price_drop' => [
        'title' => 'Price drop in your favourites',
        'body' => '{1} The price of a listing in your favourites dropped.|[2,*] The price of :count listings in your favourites dropped.',
        'line' => '“:title”: :old → :new',
    ],
    'unavailable' => [
        'title' => 'A favourite is no longer available',
        'body' => '{1} A listing in your favourites is no longer available.|[2,*] :count listings in your favourites are no longer available.',
        'line_rented' => '“:title” has been rented.',
        'line_sold' => '“:title” has been sold.',
        'line_unavailable' => '“:title” is no longer listed.',
        'line_removed' => 'A listing in your favourites was removed.',
    ],
    'mail' => [
        'greeting' => 'Hello,',
        'action' => 'See my favourites',
    ],
];
