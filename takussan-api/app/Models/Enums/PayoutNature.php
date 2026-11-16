<?php

namespace App\Models\Enums;

/**
 * TCK-2909 — la nature d'un reversement, écrite à sa création (`payouts.nature`) :
 *
 *  - `advance` (acompte) : un reversement au bailleur après lequel l'agence détient encore, pour ce
 *    bailleur, des encaissements reversables qu'aucun reversement ne porte ;
 *  - `balance` (solde) : un reversement au bailleur qui porte tout ce qui restait à reverser ;
 *  - `deposit_refund` : la restitution d'une caution au locataire ;
 *  - `refund` : un remboursement déjà sorti, constaté (`refunded_payment_id`) ;
 *  - `provider_bill` : le paiement d'une facture de prestataire.
 *
 * Un reversement au bailleur antérieur à la colonne n'a pas de nature (`null`).
 */
enum PayoutNature: string
{
    case Advance = 'advance';
    case Balance = 'balance';
    case DepositRefund = 'deposit_refund';
    case Refund = 'refund';
    case ProviderBill = 'provider_bill';
}
