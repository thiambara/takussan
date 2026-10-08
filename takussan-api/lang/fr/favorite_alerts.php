<?php

// TCK-599 §5 — les alertes de favori, dans la langue du destinataire.
return [
    'price_drop' => [
        'title' => 'Baisse de prix dans vos favoris',
        'body' => '{1} Le prix d’un bien de vos favoris a baissé.|[2,*] Le prix de :count biens de vos favoris a baissé.',
        'line' => '« :title » : :old → :new',
    ],
    'unavailable' => [
        'title' => 'Un favori n’est plus disponible',
        'body' => '{1} Un bien de vos favoris n’est plus disponible.|[2,*] :count biens de vos favoris ne sont plus disponibles.',
        'line_rented' => '« :title » a été loué.',
        'line_sold' => '« :title » a été vendu.',
        'line_unavailable' => '« :title » n’est plus proposé.',
        'line_removed' => 'Un bien de vos favoris a été retiré.',
    ],
    'mail' => [
        'greeting' => 'Bonjour,',
        'action' => 'Voir mes favoris',
    ],
];
