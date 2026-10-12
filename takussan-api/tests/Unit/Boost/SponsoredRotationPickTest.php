<?php

namespace Tests\Unit\Boost;

use App\Services\Boost\SponsoredRotation;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §7) — la rotation est DÉTERMINISTE : même graine, même tirage (la page reste
 * cacheable dans l'heure) ; la page p prend la tranche p en bouclant (chaque vedette passe à son tour).
 */
class SponsoredRotationPickTest extends TestCase
{
    public function test_la_graine_ignore_la_page_et_l_ordre_des_cles_mais_pas_l_heure(): void
    {
        $at = Carbon::parse('2026-10-12 10:15:00', 'UTC');

        $a = SponsoredRotation::seed(['contract_type' => 'rent', 'city' => 'Dakar', 'page' => 1, 'per_page' => 20], $at);
        $b = SponsoredRotation::seed(['city' => 'Dakar', 'contract_type' => 'rent', 'page' => 4], $at->copy()->addMinutes(40));

        $this->assertSame($a, $b);
        $this->assertNotSame($a, SponsoredRotation::seed(['city' => 'Dakar', 'contract_type' => 'rent'], $at->copy()->addHour()));
        $this->assertNotSame($a, SponsoredRotation::seed(['city' => 'Thiès', 'contract_type' => 'rent'], $at));
        $this->assertSame(
            SponsoredRotation::seed(['cities' => ['Dakar', 'Thiès'], 'q' => ''], $at),
            SponsoredRotation::seed(['cities' => ['Thiès', 'Dakar']], $at),
            'les valeurs vides tombent, les listes sont triées',
        );
    }

    public function test_meme_graine_meme_tirage(): void
    {
        $ids = range(1, 20);

        $this->assertSame(
            SponsoredRotation::pick($ids, 'graine', 1, 3),
            SponsoredRotation::pick(array_reverse($ids), 'graine', 1, 3),
            'l’ordre d’arrivée du vivier ne compte pas',
        );
        $this->assertNotSame(SponsoredRotation::pick($ids, 'graine', 1, 20), SponsoredRotation::pick($ids, 'autre', 1, 20));
    }

    public function test_les_pages_successives_font_passer_chaque_vedette(): void
    {
        $ids = [11, 22, 33, 44, 55];
        $vus = [];
        foreach ([1, 2, 3] as $page) {
            $tranche = SponsoredRotation::pick($ids, 'g', $page, 2);
            $this->assertCount(2, $tranche);
            $this->assertCount(2, array_unique($tranche));
            $vus = [...$vus, ...$tranche];
        }

        $this->assertEqualsCanonicalizing($ids, array_values(array_unique($vus)));
    }

    public function test_bornes(): void
    {
        $this->assertSame([], SponsoredRotation::pick([], 'g', 1, 3));
        $this->assertSame([], SponsoredRotation::pick([1, 2], 'g', 1, 0));
        $this->assertCount(2, SponsoredRotation::pick([1, 2], 'g', 1, 5), 'jamais deux fois le même bien sur une page');
    }
}
