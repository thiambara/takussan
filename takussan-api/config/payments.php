<?php

// TCK-593 — passerelle de paiement en ligne.
return [
    /*
     * Durée, en minutes, pendant laquelle un checkout ouvert sur un payable est RÉUTILISÉ au lieu
     * d'en ouvrir un second (double clic, deux onglets, retour arrière depuis la page du
     * fournisseur), et pendant laquelle l'enregistrement manuel d'un règlement est refusé. Fondée
     * sur la durée de vie d'une session de checkout Wave (30 minutes).
     */
    'checkout_reuse_minutes' => 30,

    /*
     * TCK-602 (ADR-0051 §1) — le lien porteur d'une échéance (`/pay/{jeton}`).
     *  - `ttl_days_after_due` : avant paiement, le lien vit jusqu'à la plus tardive de (aujourd'hui,
     *    échéance) + ce nombre de jours — le temps qu'une relance d'impayé a un sens ;
     *  - `receipt_days` : après paiement, il ne vit plus que ce nombre de jours après `paid_at` —
     *    le temps de télécharger sa quittance, qui nomme le locataire.
     */
    'pay_link' => [
        'ttl_days_after_due' => 60,
        'receipt_days' => 30,
    ],
];
