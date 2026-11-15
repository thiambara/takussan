<?php

/*
 * TCK-2866 — la balance âgée imprimée (`pdf.reports.aged-balance`), à envoyer au bailleur.
 * Le wolof est en pause (2026-10-16) : le texte français, tel quel.
 */
return [
    'title' => 'Balance âgée des impayés',
    'agency' => 'Agence',
    'landlord' => 'Bailleur',
    'all_landlords' => 'Tous les bailleurs',
    'as_of' => 'Arrêtée au',
    'tenant' => 'Locataire',
    'total' => 'Total',
    'count' => 'Échéances',
    'deposits_held' => 'Cautions détenues',
    'none' => 'Aucun impayé échu à cette date.',
    'unnamed' => 'Sans nom',
    'buckets' => [
        '1_30' => '1 à 30 jours',
        '31_60' => '31 à 60 jours',
        '61_90' => '61 à 90 jours',
        '90_plus' => 'Plus de 90 jours',
    ],
];
