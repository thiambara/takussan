<?php

/**
 * TCK-602 (ADR-0051 §6) — rétention du journal des webhooks entrants, par canal, en jours.
 *
 * Les paiements se gardent plus longtemps (la fenêtre d'un litige de rapprochement) que la
 * messagerie, dont les accusés n'alimentent que des statuts de livraison. La purge ne tourne qu'au
 * scheduler (`webhooks:prune`), jamais à la lecture ni sur le chemin d'un webhook.
 */
return [
    'retention_days' => [
        'payment' => 90,
        'sms' => 30,
        'whatsapp' => 30,
    ],
];
