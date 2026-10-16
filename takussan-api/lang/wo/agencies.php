<?php

return [
    'errors' => [
        // TCK-454 — le vocabulaire est celui que `team.php` emploie déjà pour
        // le même refus (« Ajance ind amul … ») : recopié, non réinventé
        // (dette TCK-339).
        'individual_no_custom_roles' => 'Ajance ind amul rol yu ñu defar ci boppam.',
    ],
    // TCK-656 — messages de validation, rendus dans la langue de la requête.
    'validation' => [
        'profile_type_without_role' => 'Xeetu profil bii amul rol ci ajance.',
        'capability_platform_reserved' => 'Mën-mën bii ñu ngi ko denc ngir platform bi : benn rol ci ajance mënul ko yor.',
    ],
];
