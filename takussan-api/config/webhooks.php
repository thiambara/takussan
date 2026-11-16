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

    // TCK-606 — une ligne `rejected` (signature absente ou fausse, jeton inconnu) ne porte rien
    // qu'un litige de rapprochement relira : elle se purge à cette borne, quel que soit son canal.
    // Au plafond du débit, elle vivait sinon 90 jours comme une ligne authentifiée.
    'rejected_retention_days' => 7,
];
