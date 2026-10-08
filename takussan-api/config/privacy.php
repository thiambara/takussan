<?php

/*
 * TCK-601 (ADR-0044 §4) — le registre des demandes de droits.
 *
 * `rights_request_deadline_days` : délai de réponse à une demande d'accès, de rectification,
 * d'opposition, d'effacement ou de portabilité. 30 jours est une VALEUR DE TRAVAIL (loi n° 2008-12),
 * à confirmer par le conseil juridique avant la production — d'où la configuration plutôt qu'une
 * constante : la changer ne demande pas de déploiement de code.
 */
return [
    'rights_request_deadline_days' => (int) env('PRIVACY_RIGHTS_REQUEST_DEADLINE_DAYS', 30),
];
