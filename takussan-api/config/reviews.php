<?php

/**
 * Avis — réglages.
 */
return [
    // TCK-2863 — combien de jours après la clôture d'un bail le locataire est encore invité à le
    // noter (`GET /api/me/review-opportunities`, clé `lease_closed`).
    'lease_closed_window_days' => 90,
];
