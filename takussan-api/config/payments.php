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
];
