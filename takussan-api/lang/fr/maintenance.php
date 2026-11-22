<?php

/*
 * TCK-592 — textes du domaine maintenance. Depuis TCK-588, une notification est un code
 * (`notifications.php` → `codes.maintenance*`) et un refus un code d'erreur (`errors.php` →
 * `maintenance.*`) ; restent ici les refus de validation et le devis PDF. TCK-2958 : les libellés de statut
 * et les messages système du fil ont quitté ce fichier avec leur dernier lecteur
 * (`SystemMessageFactory::humanise`) — le front compose l'avis depuis son code.
 */
return [

    'errors' => [
        'not_assignable' => 'Ce compte ne peut pas recevoir l\'intervention : il faut un prestataire actif en collaboration active avec l\'agence du bien, ou un membre de son équipe.',
        // TCK-2715 — la borne haute du passage (`MaintenanceRequest::SCHEDULING_HORIZON_MONTHS`).
        'beyond_scheduling_horizon' => 'Le passage ne peut pas être fixé à plus d\'un an d\'ici.',
        'invitation_request_invalid' => 'La demande d\'intervention liée doit appartenir à cette agence et ne pas être clôturée ni annulée.',
    ],

    'quote_pdf' => [
        'title' => 'Devis d\'intervention',
        'request' => 'Intervention',
        'property' => 'Bien',
        'provider' => 'Prestataire',
        'submitted_at' => 'Soumis le',
        'valid_until' => 'Valable jusqu\'au',
        'duration' => 'Durée estimée',
        'duration_days' => ':days jour(s)',
        'label' => 'Désignation',
        'kind' => 'Nature',
        'quantity' => 'Quantité',
        'unit_price' => 'Prix unitaire',
        'line_total' => 'Total',
        'total' => 'Total du devis',
        'kinds' => [
            'labour' => 'Main-d\'œuvre',
            'supply' => 'Fourniture',
        ],
    ],

    // TCK-2911 (ADR-0120 § 2) — le relevé des factures du prestataire.
    'bill_statement_pdf' => [
        'title' => 'Relevé de mes factures',
        'provider' => 'Prestataire',
        'period' => 'Période',
        'reference' => 'Référence',
        'date' => 'Date',
        'request' => 'Intervention',
        'property' => 'Bien',
        'status' => 'Statut',
        'amount' => 'Montant',
        'empty' => 'Aucune facture sur cette période.',
        'billed_total' => 'Total facturé (hors rejetées et annulées)',
        'paid_total' => 'Dont payé',
        'statuses' => [
            'draft' => 'À facturer',
            'pending_validation' => 'En attente de validation',
            'validated' => 'Validée',
            'rejected' => 'Rejetée',
            'paid' => 'Payée',
            'cancelled' => 'Annulée',
        ],
    ],

    // TCK-2897 (ADR-0099, amendement du 2026-11-15) — le PDF d'une facture d'intervention.
    'bill_pdf' => [
        'title' => 'Facture d\'intervention',
        'reference' => 'Référence',
        'provider_reference' => 'Référence du prestataire',
        'date' => 'Date',
        'request' => 'Intervention',
        'property' => 'Bien',
        'provider' => 'Prestataire',
        'status' => 'Statut',
        'amount' => 'Montant',
    ],

    // TCK-2897 (ADR-0099, amendement du 2026-11-15) — le rapport de fin d'intervention.
    'completion_report_pdf' => [
        'title' => 'Rapport de fin d\'intervention',
        'request' => 'Intervention',
        'property' => 'Bien',
        'provider' => 'Prestataire',
        'reported_at' => 'Signalée le',
        'started_at' => 'Commencée le',
        'completed_at' => 'Terminée le',
        'cost' => 'Coût réel',
        'description' => 'Travaux demandés',
        'resolution' => 'Travaux réalisés',
        'no_notes' => 'Aucune note.',
        'photos_before' => 'Photos avant',
        'photos_after' => 'Photos après',
        'no_photos' => 'Aucune photo.',
    ],
];
