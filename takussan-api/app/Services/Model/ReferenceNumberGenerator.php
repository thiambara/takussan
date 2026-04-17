<?php

namespace App\Services\Model;

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

    public static function payout(): string
    {
        return 'PO-'.now()->format('Ym').'-'.strtoupper(Str::random(6));
    }
}
