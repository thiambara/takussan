<?php

return [
    'rules' => [
        'phone' => 'Le numéro de téléphone doit être un numéro sénégalais valide (ex. +221 77 123 45 67 ou 771234567).',
        'currency' => 'La devise doit être l’une des suivantes : :allowed.',
        'date_range' => 'La date doit être postérieure ou égale à :start.',
        'strong_password' => 'Le mot de passe doit contenir au moins 8 caractères, dont une majuscule, une minuscule, un chiffre et un caractère spécial.',
    ],
    'max_guarantors_reached' => 'Un bail ne peut pas avoir plus de 3 garants.',
    'bounds_format' => 'Le champ :attribute doit contenir quatre nombres séparés par des virgules : sw_lat,sw_lng,ne_lat,ne_lng.',
    'commission_share_exceeds_cap' => 'La somme des commissions pour cette propriété ne peut excéder 100%.',
];
