<?php

namespace App\Contracts\Payments;

use App\Models\Payout;
use App\Models\PayoutMethod;
use App\Services\Payout\Disbursement\ManualDisbursementDriver;

/**
 * TCK-594 (ADR-0039 §1) — DÉCAISSER, distinct d'encaisser ({@see PaymentDriverContract}).
 *
 * Encaisser et décaisser n'ont ni les mêmes appels, ni les mêmes risques : un pilote d'encaissement
 * reçoit l'argent d'un inconnu, un pilote de décaissement en envoie à une destination qu'il faut
 * avoir vérifiée. Un seul pilote aujourd'hui, {@see ManualDisbursementDriver}
 * — l'humain paie dans Wave Business, Orange Money ou sa banque, puis saisit la référence. Le pilote
 * automatique fera l'objet d'un ticket suivant ; s'il convertit un montant en entier, c'est ici, à
 * la frontière du pilote, et nulle part avant (principe n° 3).
 */
interface DisbursementDriverContract
{
    /**
     * Consigne (ou exécute) le décaissement d'un reversement et rend ce qu'il faut en garder dans
     * `payouts.metadata` — jamais un identifiant de destination en clair.
     *
     * @return array<string, mixed>
     */
    public function disburse(Payout $payout, ?PayoutMethod $destination, ?string $reference): array;

    /** Le nom du pilote, consigné avec chaque décaissement. */
    public function name(): string;
}
