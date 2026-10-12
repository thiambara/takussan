<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\CreditMovementType;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §4) — un remboursement se répartit sur les lots d'origine par la méthode
 * des plus forts restes : chaque part hérite de l'expiration de SON lot, aucune ne dépasse ce que
 * son lot a fourni, et la somme vaut le prorata. Sans ce test, inverser le tri des restes laissait
 * toute la suite verte (revérification du 2026-10-12).
 */
class CreditRefundRoundingTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_prorata_se_repartit_par_plus_forts_restes_sur_trois_lots(): void
    {
        $agency = Agency::factory()->create();
        $a = $this->ledger()->grant($agency, CreditLotOrigin::AdminGrant, 7, now()->addDays(10));
        $b = $this->ledger()->grant($agency, CreditLotOrigin::AdminGrant, 5, now()->addDays(20));
        $c = $this->lotAchete($agency, 3);
        $boost = $this->boost($agency, 15);
        $this->ledger()->spend($agency, 15, CreditMovementType::Spend, $boost);

        $paye = [$a->id => 7, $b->id => 5, $c->id => 3];
        foreach ([10 => [5, 3, 2], 1 => [1], 14 => [6, 5, 3], 13 => [6, 4, 3]] as $prorata => $attendu) {
            DB::beginTransaction();
            $plan = $this->ledger()->refundPlan($boost, $prorata);
            DB::rollBack();

            $this->assertSame($prorata, $plan->refunded, "prorata $prorata");
            $this->assertSame(0, $plan->expired);
            $this->assertSame($attendu, array_column($plan->shares, 'amount'), "répartition du prorata $prorata");
            foreach ($plan->shares as $part) {
                $this->assertLessThanOrEqual($paye[$part['lot_id']], $part['amount']);
            }
        }

        $plan = $this->ledger()->refund($boost, 10);
        $lots = CreditLot::query()->where('origin', CreditLotOrigin::Refund)->orderBy('id')->get();
        $this->assertSame([5, 3, 2], $lots->pluck('initial_amount')->all());
        $this->assertTrue($lots[0]->expires_at->equalTo($a->fresh()->expires_at));
        $this->assertTrue($lots[1]->expires_at->equalTo($b->fresh()->expires_at));
        $this->assertNull($lots[2]->expires_at, 'la part d\'un lot acheté n\'expire jamais');
        $this->assertSame(10, $plan->refunded);
        $this->assertSame([], $this->ledger()->invariantViolations());
    }

    private function ledger(): CreditLedger
    {
        return app(CreditLedger::class);
    }

    private function lotAchete(Agency $agency, int $amount): CreditLot
    {
        $id = DB::table('credit_lots')->insertGetId([
            'agency_id' => $agency->id, 'origin' => CreditLotOrigin::Purchase->value, 'initial_amount' => $amount,
            'remaining_amount' => $amount, 'created_at' => now(), 'updated_at' => now(),
        ]);
        CreditMovement::record(['agency_id' => $agency->id, 'credit_lot_id' => $id, 'type' => CreditMovementType::Grant, 'amount' => $amount]);

        return CreditLot::query()->findOrFail($id);
    }

    private function boost(Agency $agency, int $price): PropertyBoost
    {
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);

        return PropertyBoost::query()->create([
            'property_id' => $property->id, 'agency_id' => $agency->id, 'kind' => BoostKind::Featured,
            'price_credits' => $price, 'duration_days' => 7, 'starts_at' => now(), 'ends_at' => now()->addDays(7),
            'status' => BoostStatus::Active,
        ]);
    }
}
