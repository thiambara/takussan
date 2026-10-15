<?php

return [
    'errors' => [
        // TCK-454 — `features.md:293` : une agence individuelle n'a pas de
        // rôles personnalisés. Elle garde son rôle SYSTÈME, d'où la formulation
        // qui vise la personnalisation et non les rôles.
        'individual_no_custom_roles' => "Les agences individuelles n'ont pas de rôles personnalisés.",
    ],
    // TCK-656 — messages de validation, rendus dans la langue de la requête.
    'validation' => [
        'profile_type_without_role' => 'Ce type de profil ne porte pas de rôle d\'agence.',
        'capability_platform_reserved' => 'Cette capacité est réservée à la plateforme : aucun rôle d\'agence ne peut la porter.',
    ],
];
