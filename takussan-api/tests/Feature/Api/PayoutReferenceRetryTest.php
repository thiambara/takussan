<?php

namespace Tests\Feature\Api;

use App\Models\Payout;
use App\Services\Model\ReferenceNumberGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * TCK-1162 (P92.09) — la référence de versement `PO-Ym-XXXXXX` est tirée au hasard, et
 * `payouts.reference_number` est unique : un tirage déjà pris se refait. Avant : la collision
 * remontait en violation d'unicité, rendue 409 `payout.already_paid_out` dans `create` (une pièce
 * « déjà reversée » qui ne l'était pas) et 500 dans `createForBill`.
 */
class PayoutReferenceRetryTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Str::createRandomStringsNormally();
        parent::tearDown();
    }

    public function test_a_reference_already_taken_is_drawn_again(): void
    {
        $taken = 'PO-'.now()->format('Ym').'-AAAAAA';
        Payout::factory()->create(['reference_number' => $taken]);

        Str::createRandomStringsUsingSequence(['aaaaaa', 'bbbbbb']);

        $this->assertSame('PO-'.now()->format('Ym').'-BBBBBB', ReferenceNumberGenerator::payout());
    }

    public function test_a_free_reference_is_kept_at_the_first_draw(): void
    {
        Str::createRandomStringsUsingSequence(['cccccc', 'dddddd']);

        $this->assertSame('PO-'.now()->format('Ym').'-CCCCCC', ReferenceNumberGenerator::payout());
    }
}
