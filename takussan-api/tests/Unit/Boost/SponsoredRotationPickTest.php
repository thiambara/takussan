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

    /**
     * TCK-2500 — `pickExcluding()` ne change ni le mélange ni la tranche : sans exclusion, c'est `pick()` ; avec, le bien
     * exclu est remplacé par le suivant dans le même ordre, et `take` borne le nombre rendu.
     */
    public function test_pick_excluding_suit_la_meme_rotation(): void
    {
        $ids = range(1, 17);
        foreach ([1, 2, 3, 7, 12] as $page) {
            $this->assertSame(SponsoredRotation::pick($ids, 'g', $page, 3), SponsoredRotation::pickExcluding($ids, 'g', $page, 3, [], 3), "page {$page}");
        }

        $tranche = SponsoredRotation::pick($ids, 'g', 2, 3);
        $suite = SponsoredRotation::pick($ids, 'g', 3, 3);
        $this->assertSame(
            [$tranche[0], $tranche[2], $suite[0]],
            SponsoredRotation::pickExcluding($ids, 'g', 2, 3, [$tranche[1]], 3),
        );
        $this->assertSame([$tranche[0]], SponsoredRotation::pickExcluding($ids, 'g', 2, 3, [], 1));
        $this->assertSame([], SponsoredRotation::pickExcluding($ids, 'g', 2, 0, [], 3));
        $this->assertSame([], SponsoredRotation::pickExcluding([1, 2], 'g', 1, 3, [1, 2], 3));
    }

    public function test_bornes(): void
    {
        $this->assertSame([], SponsoredRotation::pick([], 'g', 1, 3));
        $this->assertSame([], SponsoredRotation::pick([1, 2], 'g', 1, 0));
        $this->assertCount(2, SponsoredRotation::pick([1, 2], 'g', 1, 5), 'jamais deux fois le même bien sur une page');
    }
}
