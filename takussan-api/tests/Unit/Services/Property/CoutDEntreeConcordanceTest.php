<?php

namespace Tests\Unit\Services\Property;

use App\Models\Enums\Currency;
use App\Models\Property;
use App\Services\Property\CoutDEntree;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-633 — `CoutDEntree::pour` contre la fixture commune. `Tests\TestCase` et non celui de
 * PHPUnit : instancier `Property` démarre ses traits (Scout lit sa configuration).
 */
class CoutDEntreeConcordanceTest extends TestCase
{
    /** @return iterable<string, array{array<string, mixed>, ?string}> */
    public static function cas(): iterable
    {
        $fixture = json_decode((string) file_get_contents(__DIR__.'/../../../fixtures/cout-d-entree.json'), true, flags: JSON_THROW_ON_ERROR);
        foreach ($fixture['cas'] as $cas) {
            yield $cas['nom'] => [$cas['entree'], $cas['total']];
        }
    }

    public function test_la_fixture_porte_des_cas_des_deux_sortes(): void
    {
        $totaux = array_column(iterator_to_array(self::cas()), 1);
        $this->assertGreaterThanOrEqual(15, count($totaux));
        $this->assertContains(null, $totaux);
    }

    /** @param array<string, mixed> $entree */
    #[DataProvider('cas')]
    public function test_le_total(array $entree, ?string $attendu): void
    {
        $bien = (new Property)->forceFill($entree);

        $cout = CoutDEntree::pour($bien);

        if ($attendu === null) {
            $this->assertNull($cout);

            return;
        }
        $this->assertNotNull($cout);
        $this->assertSame($attendu, number_format($cout['total'], Currency::decimalPlacesOf($entree['currency']), '.', ''));
    }
}
