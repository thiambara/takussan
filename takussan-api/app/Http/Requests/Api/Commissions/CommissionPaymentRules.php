<?php

namespace App\Http\Requests\Api\Commissions;

use App\Models\CommissionEntry;
use App\Models\Enums\PaymentMethod;
use App\Rules\JourIso;
use App\Services\Commission\CommissionLedgerService;
use Illuminate\Validation\Rule;

/**
 * TCK-2661 — les règles de la preuve d'un paiement de commission, partagées par le paiement d'une
 * ligne et le solde groupé : la date (un jour de Dakar, au plus aujourd'hui), le moyen (ceux de
 * {@see CommissionLedgerService::PAYMENT_METHODS}) et la référence, exigée hors espèces — la règle
 * de traçabilité des décaissements (`features.md` § 1.5).
 */
trait CommissionPaymentRules
{
    /**
     * @param  ?string  $earnedDay  le jour de Dakar où la ligne est née, si une seule ligne est visée
     * @return array<string, mixed>
     */
    protected function paymentRules(?string $earnedDay = null): array
    {
        $paidAt = ['nullable', 'date_format:Y-m-d', new JourIso, 'before_or_equal:'.now(CommissionEntry::DATE_TIMEZONE)->toDateString()];
        if ($earnedDay !== null) {
            $paidAt[] = 'after_or_equal:'.$earnedDay;
        }

        return [
            'paid_at' => $paidAt,
            'payment_method' => [
                'required',
                'string',
                Rule::enum(PaymentMethod::class)->only(CommissionLedgerService::PAYMENT_METHODS),
            ],
            'payment_reference' => [
                $this->input('payment_method') === PaymentMethod::Cash->value ? 'nullable' : 'required',
                'string',
                'max:100',
            ],
        ];
    }
}
