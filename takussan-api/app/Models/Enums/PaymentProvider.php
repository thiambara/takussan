<?php

namespace App\Models\Enums;

enum PaymentProvider: string
{
    case Wave = 'wave';
    case OrangeMoney = 'orange_money';
    case LemonSqueezy = 'lemon_squeezy';

    /**
     * Currencies the provider supports for checkout.
     *
     * @return list<string>
     */
    public function supportedCurrencies(): array
    {
        return match ($this) {
            self::Wave, self::OrangeMoney => ['XOF'],
            // Lemon Squeezy supports ~25 currencies but explicitly NOT XOF.
            // We list the most common ones; mismatch is checked by `supportsCurrency`.
            self::LemonSqueezy => [
                'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY',
                'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN',
                'HKD', 'SGD', 'MXN', 'BRL', 'INR', 'ZAR', 'KRW', 'TRY',
                'ILS',
            ],
        };
    }

    public function supportsCurrency(string $currency): bool
    {
        return in_array(strtoupper($currency), $this->supportedCurrencies(), true);
    }

    public function paymentMethod(): PaymentMethod
    {
        return match ($this) {
            self::Wave => PaymentMethod::Wave,
            self::OrangeMoney => PaymentMethod::OrangeMoney,
            self::LemonSqueezy => PaymentMethod::Card,
        };
    }
}
