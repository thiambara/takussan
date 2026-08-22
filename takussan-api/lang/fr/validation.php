<?php

return [
    // Core Laravel validation messages (subset localised in FR).
    'required' => 'Le champ :attribute est obligatoire.',
    'email' => 'Le champ :attribute doit être une adresse email valide.',
    'min' => [
        'string' => 'Le champ :attribute doit contenir au moins :min caractères.',
        'numeric' => 'Le champ :attribute doit être supérieur ou égal à :min.',
    ],
    'max' => [
        'string' => 'Le champ :attribute ne peut pas contenir plus de :max caractères.',
        'numeric' => 'Le champ :attribute ne peut pas être supérieur à :max.',
    ],
    'unique' => 'La valeur du champ :attribute est déjà utilisée.',
    'exists' => 'La valeur sélectionnée pour :attribute est invalide.',

    'rules' => [
        'phone' => 'Le numéro de téléphone doit être un numéro sénégalais valide (ex. +221 77 123 45 67 ou 771234567).',
        'currency' => 'La devise doit être l’une des suivantes : :allowed.',
        'date_range' => 'La date doit être postérieure ou égale à :start.',
        'strong_password' => 'Le mot de passe doit contenir au moins 8 caractères, dont une majuscule, une minuscule, un chiffre et un caractère spécial.',
    ],
    'max_guarantors_reached' => 'Un bail ne peut pas avoir plus de 3 garants.',
    'bounds_format' => 'Le champ :attribute doit contenir quatre nombres séparés par des virgules : sw_lat,sw_lng,ne_lat,ne_lng.',
    'geo_radius_requires_point' => 'Le champ :attribute exige un point complet : lat et lng doivent être fournis tous les deux.',
    'sort_distance_requires_point' => 'Le tri par distance exige un point complet : lat et lng doivent être fournis tous les deux.',
    'commission_share_exceeds_cap' => 'La somme des commissions pour cette propriété ne peut excéder 100%.',
];
