<?php

/*
 * TCK-586 — éligibilité des collaborateurs d'un bien (`App\Rules\CollaboratorEligibleForProperty`).
 */
return [
    'not_in_agency' => 'This user cannot be added to this property in this role: they must belong to the property\'s agency.',
];
