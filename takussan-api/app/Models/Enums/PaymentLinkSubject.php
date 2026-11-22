<?php

namespace App\Models\Enums;

/**
 * TCK-2778 — ce qu'un lien de paiement d'échéance fait payer, et ce qu'une relance notée relance.
 *
 * - `rent` : le loyer dû, pénalité comprise quand l'agence encaisse ses pénalités en ligne
 *   (`PaymentGatewayService::lateFeeIncluded()`) — le comportement d'avant le ticket.
 * - `late_fee` : la pénalité de retard SEULE, restée due sur une échéance déjà payée
 *   (`LeasePayment::lateFeeAloneOutstanding()`). Le loyer n'y entre jamais.
 *
 * Jamais reçu d'un client : l'API le déduit de l'échéance.
 */
enum PaymentLinkSubject: string
{
    case Rent = 'rent';
    case LateFee = 'late_fee';
}
