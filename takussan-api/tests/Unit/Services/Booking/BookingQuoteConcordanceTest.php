<?php

namespace Tests\Unit\Services\Booking;

use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Services\Booking\BookingQuote;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-530 — le montant que le tunnel AFFICHE (`takussan-web/src/lib/booking-quote.ts`) est celui
 * que l'API ENREGISTRE. Les deux suites lisent `tests/fixtures/booking-quote.json` : un arrondi qui
 * change d'un seul côté rougit l'un des deux tests.
 *
 * Les cas couvrent ce que les tests de bout en bout n'éprouvent pas : prix non entier, reste de la
 * division par 7, demi exact, centimes EUR/USD, prix maximal de la colonne.
 */
class BookingQuoteConcordanceTest extends TestCase
{
    /** @return array<string, array{array<string,mixed>}> */
    public static function cases(): array
    {
        $json = json_decode((string) file_get_contents(__DIR__.'/../../../fixtures/booking-quote.json'), true, flags: JSON_THROW_ON_ERROR);

        $out = [];
        foreach ($json['cases'] as $case) {
            $out[sprintf('%s %s %s × %d', $case['price'], $case['currency'], $case['period'] ?? 'null', $case['nights'])] = [$case];
        }

        return $out;
    }

    /** @param  array<string,mixed>  $case */
    #[DataProvider('cases')]
    public function test_the_api_quote_matches_the_shared_fixture(array $case): void
    {
        $property = new Property([
            'price' => $case['price'],
            'currency' => Currency::from($case['currency']),
            'contract_type' => $case['period'] === 'sale' ? ContractType::Sale : ContractType::Rent,
            'rent_period' => in_array($case['period'], ['sale', null], true) ? null : RentPeriod::from($case['period']),
        ]);
        $start = Carbon::parse('2026-10-01');

        if ($case['total'] === null) {
            $this->expectException(ValidationException::class);
        }

        $quote = (new BookingQuote)->for($property, $start, $start->copy()->addDays($case['nights']));

        $this->assertSame([$case['total'], $case['deposit']], [$quote['total_amount'], $quote['deposit_amount']]);
    }

    public function test_the_fixture_is_not_empty(): void
    {
        $this->assertGreaterThanOrEqual(20, count(self::cases()));
    }
}
