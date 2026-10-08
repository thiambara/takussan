<?php

/*
 * TCK-599 (ADR-0050) — alertes de recherche : la fenêtre du moteur et les bornes de l'abonnement
 * sans compte. Durées et plafonds : option retenue par défaut, le porteur ne les a pas arbitrés.
 */
return [

    // Faux tant que le gabarit WhatsApp `utility` des alertes n'est pas approuvé par Meta : l'option
    // n'est alors ni proposée (`GET /api/public/search-alerts/capabilities`) ni servie.
    'whatsapp_enabled' => (bool) env('SEARCH_ALERTS_WHATSAPP_ENABLED', false),

    // Un bien publié dans ces dernières minutes attend le passage suivant : délai d'indexation.
    'index_margin_minutes' => 10,

    // Biens décrits dans une alerte ; le total, lui, est celui du moteur.
    'max_properties' => 5,

    // Une demande non confirmée est purgée passé ce délai (`search-alerts:purge-unconfirmed`).
    'confirmation_ttl_hours' => 48,

    // Messages de confirmation envoyés au même contact sur 24 h glissantes.
    'max_confirmations_per_day' => 2,

    // Alertes non closes (en attente ou confirmées) pour un même contact.
    'max_open_per_contact' => 5,

    // Validité du lien signé de désinscription d'une recherche de compte.
    'account_unsubscribe_days' => 60,
];
