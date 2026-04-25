<?php

namespace App\Support\Blade;

use App\Models\Enums\Currency;
use App\Providers\AppServiceProvider;
use App\Services\Formatting\CurrencyFormatter;

/**
 * TCK-084 — runtime helper backing the `@currency($amount, $currency)` Blade
 * directive registered in {@see AppServiceProvider::boot()}.
 *
 * Lives outside the service provider so PHPStan/Pint don't fight the closure
 * generator and so the rendered PHP stays small.
 */
final class CurrencyDirective
{
    /**
     * Resolve the Currency enum instance from a flexible input then defer to
     * {@see CurrencyFormatter}. `null` and unknown codes silently fall back
     * to XOF — the goal is to keep PDFs from blowing up for a stray legacy
     * row that pre-dates TCK-084.
     */
    public static function render(int|float|null $amount, mixed $currency = null, ?string $locale = null): string
    {
        if ($amount === null) {
            return '';
        }

        $resolved = self::resolve($currency);

        return app(CurrencyFormatter::class)->format($amount, $resolved, $locale);
    }

    private static function resolve(mixed $currency): Currency
    {
        if ($currency instanceof Currency) {
            return $currency;
        }

        if (is_string($currency) && $currency !== '') {
            $tried = Currency::tryFrom(strtoupper($currency));
            if ($tried !== null) {
                return $tried;
            }
        }

        return Currency::default();
    }
}
