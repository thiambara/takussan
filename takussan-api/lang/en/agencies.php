<?php

return [
    'errors' => [
        // TCK-454 — `features.md:293`: an individual agency has no custom
        // roles. It keeps its SYSTEM role, hence the wording targeting
        // customisation rather than roles.
        'individual_no_custom_roles' => "Individual agencies don't have custom roles.",
    ],
    // TCK-656 — messages de validation, rendus dans la langue de la requête.
    'validation' => [
        'profile_type_without_role' => 'This profile type does not carry an agency role.',
        'capability_platform_reserved' => 'This capability is reserved for the platform: no agency role can carry it.',
    ],
];
