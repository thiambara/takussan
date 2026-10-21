<?php

namespace App\Services\Model;

use App\Models\Payout;
use Illuminate\Support\Str;

class ReferenceNumberGenerator
{
    public static function booking(): string
    {
        return 'BK-'.strtoupper(Str::random(8));
    }

    public static function bookingPayment(): string
    {
        return 'BPY-'.strtoupper(Str::random(8));
    }

    public static function receipt(): string
    {
        return 'RCP-'.strtoupper(Str::random(6));
    }

    public static function lease(): string
    {
        return 'LS-'.strtoupper(Str::random(8));
    }

    public static function leasePayment(): string
    {
        return 'LPY-'.strtoupper(Str::random(6));
    }

    public static function invoice(): string
    {
        return 'INV-'.now()->format('Ym').'-'.strtoupper(Str::random(6));
    }

    /**
     * TCK-1162 (P92.09) — `payouts.reference_number` est unique : un tirage déjà pris se refait.
     * Sans cela, la collision remontait en violation d'unicité, lue comme une pièce déjà reversée
     * (409) dans `PayoutService::create` et en 500 dans `createForBill`.
     */
    public static function payout(): string
    {
        do {
            $reference = 'PO-'.now()->format('Ym').'-'.strtoupper(Str::random(6));
        } while (Payout::withTrashed()->where('reference_number', $reference)->exists());

        return $reference;
    }
}
